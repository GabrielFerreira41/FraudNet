"""
Utilitaires partagés par les 3 agents graphe.
Extraction de features par compte, construction d'adjacence, normalisation.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
import torch
from sklearn.preprocessing import StandardScaler

# Features transactionnelles agrégées par compte (moyenne sur toutes ses tx)
ACCOUNT_FEAT_COLS = [
    "montant", "ratio_montant", "montant_anormal", "score_anomalie_tx",
    "velocite_1h", "velocite_24h", "montant_cumul_1h",
    "montant_moy_30tx", "ecart_montant_30tx", "est_rafale",
    "n_comptes_par_device", "n_comptes_par_commercant", "degre_compte",
    "delta_min_prev_tx", "nouveau_commercant", "nouveau_device",
    "heure", "est_weekend",
]
N_ACCOUNT_FEATS = len(ACCOUNT_FEAT_COLS)


def build_account_features(df: pd.DataFrame) -> tuple[np.ndarray, list]:
    """
    Agrège les features transaction → compte (moyenne).
    Retourne (X: [n_accounts, n_feats], accounts: liste ordonnée d'account_id).
    """
    agg = df.groupby("account_id")[ACCOUNT_FEAT_COLS].mean()
    agg["n_transactions"] = df.groupby("account_id").size()
    agg["tx_fraud_rate"]  = df.groupby("account_id")["is_fraud"].mean()
    accounts = list(agg.index)
    return agg.fillna(0).values.astype(np.float32), accounts


def get_account_labels(df: pd.DataFrame, accounts: list) -> np.ndarray:
    """
    Label binaire par compte : 1 si le compte a ≥1 transaction frauduleuse.
    """
    fraud_set = set(df[df["is_fraud"]]["account_id"].unique())
    return np.array([1.0 if a in fraud_set else 0.0 for a in accounts])


def temporal_split(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Split 11 semaines train / 2 semaines test (toujours temporel)."""
    df = df.copy()
    df["timestamp"] = pd.to_datetime(df["timestamp"])
    cutoff = df["timestamp"].max() - pd.Timedelta(weeks=2)
    return df[df["timestamp"] <= cutoff], df[df["timestamp"] > cutoff]


def fit_scaler(x_train: np.ndarray, x_test: np.ndarray) -> tuple[np.ndarray, np.ndarray, StandardScaler]:
    scaler = StandardScaler()
    return scaler.fit_transform(x_train), scaler.transform(x_test), scaler


def account_index(accounts: list) -> dict:
    """Mapping account_id → indice entier pour la construction des edge_index."""
    return {a: i for i, a in enumerate(accounts)}
