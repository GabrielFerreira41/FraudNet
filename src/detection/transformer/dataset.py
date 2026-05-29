"""
FraudSequenceDataset — Construction des séquences par compte.

Logique :
  Pour un compte ayant N transactions triées par timestamp, on génère
  N séquences. La séquence i utilise les transactions [max(0, i-SEQ_LEN+1) : i+1]
  comme contexte et prédit is_fraud[i].

  Les séquences courtes (début d'historique) sont paddées à gauche avec des zéros.
  Le padding_mask signale au Transformer les positions à ignorer.

Split temporel (cohérent avec le Baseline) :
  Train : premières 11 semaines
  Test  : 2 dernières semaines
"""
from __future__ import annotations
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd
import torch
from torch.utils.data import Dataset

from src.detection.transformer.model import (
    NUMERIC_COLS,
    DEVICE_TO_IDX, CATEGORIE_TO_IDX, ARCHETYPE_TO_IDX, PROVINCE_TO_IDX,
)

FEATURES_PATH = Path("data/generated/features.parquet")
ACCOUNTS_PATH = Path("data/generated/accounts.parquet")

MAX_SEQ_LEN = 50  # fenêtre maximale d'historique par compte


# ─────────────────────────────────────────────────────────────────────────────
# Normalisation des features numériques
# ─────────────────────────────────────────────────────────────────────────────

class FeatureScaler:
    """
    Min-max scaling entraîné sur le split train uniquement.
    Évite la fuite de données (data leakage) vers le set de test.
    """

    def __init__(self) -> None:
        self.min_: np.ndarray | None = None
        self.scale_: np.ndarray | None = None

    def fit(self, X: np.ndarray) -> "FeatureScaler":
        self.min_   = X.min(axis=0)
        self.scale_ = np.clip(X.max(axis=0) - X.min(axis=0), 1e-8, None)
        return self

    def transform(self, X: np.ndarray) -> np.ndarray:
        return np.clip((X - self.min_) / self.scale_, 0.0, 1.0).astype(np.float32)

    def fit_transform(self, X: np.ndarray) -> np.ndarray:
        return self.fit(X).transform(X)


# ─────────────────────────────────────────────────────────────────────────────
# Chargement et préparation des données
# ─────────────────────────────────────────────────────────────────────────────

def _compute_age(date_naissance_series: pd.Series) -> pd.Series:
    today = date.today()
    return pd.to_datetime(date_naissance_series).apply(
        lambda d: (today - d.date()).days / 365.25
    )


def load_and_split(
    features_path: Path = FEATURES_PATH,
    accounts_path: Path = ACCOUNTS_PATH,
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """
    Charge features.parquet + accounts.parquet, fait le split temporel.
    Retourne (train_df, test_df, accounts_df).
    """
    df = pd.read_parquet(features_path)
    df["timestamp"] = pd.to_datetime(df["timestamp"])
    df = df.sort_values(["account_id", "timestamp"]).reset_index(drop=True)

    acc = pd.read_parquet(accounts_path)

    cutoff = df["timestamp"].max() - pd.Timedelta(weeks=2)
    train_df = df[df["timestamp"] <= cutoff].copy()
    test_df  = df[df["timestamp"] >  cutoff].copy()

    return train_df, test_df, acc


def prepare_accounts(acc_df: pd.DataFrame, revenu_max: float | None = None) -> pd.DataFrame:
    """
    Enrichit accounts_df avec age_norm et revenu_norm.
    revenu_max est calculé sur le train set pour éviter le leakage.
    """
    acc = acc_df.copy()
    acc["age"] = _compute_age(acc["date_naissance"])

    if revenu_max is None:
        revenu_max = acc["revenu_mensuel"].max()
    age_max = acc["age"].max()

    acc["revenu_norm"] = (acc["revenu_mensuel"] / revenu_max).clip(0, 1).astype(np.float32)
    acc["age_norm"]    = (acc["age"] / age_max).clip(0, 1).astype(np.float32)

    acc["archetype_idx"] = acc["archetype"].map(ARCHETYPE_TO_IDX).fillna(0).astype(np.int64)
    acc["province_idx"]  = acc["province"].map(PROVINCE_TO_IDX).fillna(0).astype(np.int64)

    return acc.set_index("account_id")


# ─────────────────────────────────────────────────────────────────────────────
# Dataset PyTorch
# ─────────────────────────────────────────────────────────────────────────────

class FraudSequenceDataset(Dataset):
    """
    Pour chaque transaction du split, fournit :
      - numeric_seq   : (MAX_SEQ_LEN, N_NUMERIC)  — features numériques normalisées
      - device_seq    : (MAX_SEQ_LEN,)             — index device
      - categorie_seq : (MAX_SEQ_LEN,)             — index categorie
      - archetype_seq : (MAX_SEQ_LEN,)             — index archetype (par tx)
      - delta_seq     : (MAX_SEQ_LEN,)             — Δt en minutes (clampé ≥ 0)
      - padding_mask  : (MAX_SEQ_LEN,)             — True = position paddée
      - profile_arch  : ()  — index archetype du compte (statique)
      - profile_prov  : ()  — index province du compte (statique)
      - profile_rev   : ()  — revenu normalisé
      - profile_age   : ()  — âge normalisé
      - label         : ()  — is_fraud (float 0/1)
    """

    def __init__(
        self,
        df: pd.DataFrame,
        accounts: pd.DataFrame,       # résultat de prepare_accounts()
        scaler: FeatureScaler,
        max_seq_len: int = MAX_SEQ_LEN,
    ) -> None:
        self.max_seq_len = max_seq_len
        self.accounts = accounts

        # Normalise les features numériques
        X_num = scaler.transform(df[NUMERIC_COLS].values.astype(np.float32))
        df = df.copy()
        for i, col in enumerate(NUMERIC_COLS):
            df[col] = X_num[:, i]

        # Encode les catégoriels
        df["device_idx"]    = df["device"].map(DEVICE_TO_IDX).fillna(0).astype(np.int64)
        df["categorie_idx"] = df["categorie"].map(CATEGORIE_TO_IDX).fillna(0).astype(np.int64)
        df["archetype_idx"] = df["archetype"].map(ARCHETYPE_TO_IDX).fillna(0).astype(np.int64)

        # Construit les séquences par compte
        self._sequences: list[dict] = []
        self._build_sequences(df)

    def _build_sequences(self, df: pd.DataFrame) -> None:
        """
        Pour chaque transaction i d'un compte, construit la fenêtre
        [i - max_seq_len + 1 : i + 1] (paddée à gauche si nécessaire).
        """
        for account_id, grp in df.groupby("account_id", sort=False):
            grp = grp.sort_values("timestamp").reset_index(drop=True)
            N   = len(grp)

            # Matrices par compte (N, *)
            num  = grp[NUMERIC_COLS].values.astype(np.float32)  # (N, 20)
            dev  = grp["device_idx"].values.astype(np.int64)
            cat  = grp["categorie_idx"].values.astype(np.int64)
            arch = grp["archetype_idx"].values.astype(np.int64)
            delt = np.clip(grp["delta_min_prev_tx"].values, 0, None).astype(np.float32)
            lab  = grp["is_fraud"].values.astype(np.float32)

            # Profil statique du compte
            if account_id in self.accounts.index:
                acc_row    = self.accounts.loc[account_id]
                prof_arch  = int(acc_row["archetype_idx"])
                prof_prov  = int(acc_row["province_idx"])
                prof_rev   = float(acc_row["revenu_norm"])
                prof_age   = float(acc_row["age_norm"])
            else:
                prof_arch = prof_prov = 0
                prof_rev  = prof_age  = 0.5

            # Génère une séquence pour chaque transaction
            for i in range(N):
                start = max(0, i - self.max_seq_len + 1)
                end   = i + 1
                window_len = end - start          # ≤ max_seq_len
                pad_len    = self.max_seq_len - window_len  # ≥ 0

                # Tenseurs paddés à gauche avec des zéros
                num_seq  = np.zeros((self.max_seq_len, num.shape[1]),  dtype=np.float32)
                dev_seq  = np.zeros(self.max_seq_len,                   dtype=np.int64)
                cat_seq  = np.zeros(self.max_seq_len,                   dtype=np.int64)
                arch_seq = np.zeros(self.max_seq_len,                   dtype=np.int64)
                delt_seq = np.zeros(self.max_seq_len,                   dtype=np.float32)
                pad_mask = np.ones(self.max_seq_len,                    dtype=bool)

                num_seq[pad_len:]  = num[start:end]
                dev_seq[pad_len:]  = dev[start:end]
                cat_seq[pad_len:]  = cat[start:end]
                arch_seq[pad_len:] = arch[start:end]
                delt_seq[pad_len:] = delt[start:end]
                pad_mask[pad_len:] = False  # positions réelles → non masquées

                self._sequences.append({
                    "numeric":      num_seq,
                    "device":       dev_seq,
                    "categorie":    cat_seq,
                    "archetype":    arch_seq,
                    "delta":        delt_seq,
                    "padding_mask": pad_mask,
                    "prof_arch":    prof_arch,
                    "prof_prov":    prof_prov,
                    "prof_rev":     prof_rev,
                    "prof_age":     prof_age,
                    "label":        lab[i],
                })

    def __len__(self) -> int:
        return len(self._sequences)

    def __getitem__(self, idx: int) -> dict[str, torch.Tensor]:
        s = self._sequences[idx]
        return {
            "numeric":      torch.from_numpy(s["numeric"]),
            "device":       torch.from_numpy(s["device"]),
            "categorie":    torch.from_numpy(s["categorie"]),
            "archetype":    torch.from_numpy(s["archetype"]),
            "delta":        torch.from_numpy(s["delta"]),
            "padding_mask": torch.from_numpy(s["padding_mask"]),
            "prof_arch":    torch.tensor(s["prof_arch"], dtype=torch.long),
            "prof_prov":    torch.tensor(s["prof_prov"], dtype=torch.long),
            "prof_rev":     torch.tensor(s["prof_rev"],  dtype=torch.float32),
            "prof_age":     torch.tensor(s["prof_age"],  dtype=torch.float32),
            "label":        torch.tensor(s["label"],     dtype=torch.float32),
        }

    @property
    def pos_weight(self) -> torch.Tensor:
        """Poids pour BCE pondérée : n_légitimes / n_fraudes."""
        labels = np.array([s["label"] for s in self._sequences])
        n_pos  = labels.sum()
        n_neg  = len(labels) - n_pos
        return torch.tensor(n_neg / max(n_pos, 1), dtype=torch.float32)

    @property
    def class_counts(self) -> tuple[int, int]:
        labels = np.array([s["label"] for s in self._sequences])
        return int((labels == 0).sum()), int(labels.sum())
