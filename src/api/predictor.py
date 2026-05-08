"""
Prédicateur MARS — charge les 3 modèles en mémoire au démarrage
et expose une interface de scoring à la transaction.
"""
from __future__ import annotations
import pickle
from pathlib import Path

import numpy as np
import pandas as pd
import torch

from src.detection.graph.agent import compute_graph_scores
from src.detection.sequence.agent import LSTMAutoEncoder, SEQ_FEATURES, SEQ_LEN
from src.detection.fusion.meta_reasoner import aggregate, decide, THRESHOLD_BLOCK

BASELINE_MODEL_PATH  = Path("models/baseline.pkl")
GRAPH_MODEL_PATH     = Path("models/graph_lgbm.pkl")
SEQUENCE_MODEL_PATH  = Path("models/sequence_lstm.pt")
SCALER_PATH          = Path("models/sequence_scaler.pkl")
FEATURES_PATH        = Path("data/generated/features.parquet")
ACCOUNTS_PATH        = Path("data/generated/accounts.parquet")
MARS_PATH            = Path("reports/mars_scores.parquet")


class FraudPredictor:
    def __init__(self) -> None:
        # Agent Baseline (LightGBM)
        with open(BASELINE_MODEL_PATH, "rb") as f:
            data = pickle.load(f)
        self._baseline = data["model"]
        self._baseline_features: list[str] = data["feature_cols"]

        # Agent Graphe (LightGBM + graph_propagation)
        with open(GRAPH_MODEL_PATH, "rb") as f:
            data = pickle.load(f)
        self._graph = data["model"]
        self._graph_features: list[str] = data["features"]

        # Agent Séquence (LSTM auto-encodeur)
        with open(SCALER_PATH, "rb") as f:
            self._scaler = pickle.load(f)
        self._lstm = LSTMAutoEncoder(n_features=len(SEQ_FEATURES))
        self._lstm.load_state_dict(torch.load(SEQUENCE_MODEL_PATH, weights_only=True))
        self._lstm.eval()

        # Feature store — trié par compte puis timestamp pour la fenêtre glissante
        self.features_df = pd.read_parquet(FEATURES_PATH)
        self.features_df["timestamp"] = pd.to_datetime(self.features_df["timestamp"])
        self.features_df = (
            self.features_df
            .sort_values(["account_id", "timestamp"])
            .reset_index(drop=True)
        )

        # Propagation graphe pré-calculée une seule fois (graphe global)
        self.features_df["graph_propagation"] = compute_graph_scores(self.features_df)

        # Comptes et scores MARS pré-calculés (pour le LLM Raisonneur)
        self.accounts_df = pd.read_parquet(ACCOUNTS_PATH)
        self.mars_df = pd.read_parquet(MARS_PATH) if MARS_PATH.exists() else None

        # Index rapide : transaction_id → position dans features_df
        self._tx_index: dict[str, int] = {
            tid: i for i, tid in enumerate(self.features_df["transaction_id"])
        }

        # Index rapide : account_id → liste ordonnée de positions dans features_df
        self._account_idx_map: dict[str, list[int]] = {
            str(acc_id): grp.index.tolist()
            for acc_id, grp in self.features_df.groupby("account_id")
        }

        # Position de chaque transaction dans la séquence de son compte
        self._tx_pos: dict[int, int] = {
            idx: pos
            for indices in self._account_idx_map.values()
            for pos, idx in enumerate(indices)
        }

        # Matrice de features normalisées pour le LSTM (une seule fois)
        self._X_scaled = self._scaler.transform(
            self.features_df[SEQ_FEATURES].values.astype(np.float32)
        )

    # ------------------------------------------------------------------
    # Scoring public
    # ------------------------------------------------------------------

    def score(self, transaction_id: str) -> dict:
        """Score une transaction via les 3 agents + agrégation MARS."""
        idx = self._tx_index.get(transaction_id)
        if idx is None:
            raise KeyError(f"Transaction {transaction_id} introuvable")

        row = self.features_df.iloc[[idx]]
        account_id = str(row.iloc[0]["account_id"])

        s_baseline = float(self._baseline.predict(row[self._baseline_features])[0])
        s_graph    = float(self._graph.predict(row[self._graph_features])[0])
        s_sequence = self._score_sequence(idx, account_id)

        scores = {"baseline": s_baseline, "sequence": s_sequence, "graph": s_graph}
        score_final, contradiction, _ = aggregate(scores)
        decision   = decide(score_final)
        confidence = float(np.clip(
            1.0 - abs(score_final - THRESHOLD_BLOCK) / THRESHOLD_BLOCK, 0.0, 1.0
        ))
        is_fraud = bool(row.iloc[0]["is_fraud"]) if "is_fraud" in row.columns else None

        return {
            "transaction_id": transaction_id,
            "score_mars":     round(score_final, 4),
            "decision":       decision,
            "agent_scores": {
                "baseline": round(s_baseline, 4),
                "sequence": round(s_sequence, 4),
                "graph":    round(s_graph, 4),
            },
            "contradiction":  contradiction,
            "confidence":     round(confidence, 4),
            "is_fraud_label": is_fraud,
        }

    # ------------------------------------------------------------------
    # Scoring séquence (LSTM)
    # ------------------------------------------------------------------

    def _score_sequence(self, idx: int, account_id: str) -> float:
        pos = self._tx_pos.get(idx, -1)
        if pos < SEQ_LEN - 1:
            return 0.5  # cold-start : pas assez d'historique

        indices    = self._account_idx_map[account_id]
        seq_idx    = indices[pos - SEQ_LEN + 1 : pos]  # 9 transactions précédentes
        seq        = torch.tensor(self._X_scaled[seq_idx], dtype=torch.float32).unsqueeze(0)
        target     = self._X_scaled[idx]

        with torch.no_grad():
            pred = self._lstm(seq).squeeze().numpy()

        err = float(np.mean((target - pred) ** 2))
        return float(1 / (1 + np.exp(-err * 10)))

    # ------------------------------------------------------------------
    # Utilitaires
    # ------------------------------------------------------------------

    def has_transaction(self, transaction_id: str) -> bool:
        return transaction_id in self._tx_index

    def sample_ids(self, n: int = 5) -> dict[str, list[str]]:
        """Retourne n IDs de fraudes et n IDs légitimes pour tests."""
        fraud = (
            self.features_df[self.features_df["is_fraud"]]["transaction_id"]
            .head(n).tolist()
        )
        legit = (
            self.features_df[~self.features_df["is_fraud"]]["transaction_id"]
            .head(n).tolist()
        )
        return {"fraud": fraud, "legitimate": legit}

    @property
    def stats(self) -> dict:
        n       = len(self.features_df)
        n_fraud = int(self.features_df["is_fraud"].sum())
        return {
            "transactions_indexed": n,
            "accounts_indexed":     len(self._account_idx_map),
            "fraud_rate":           round(n_fraud / n, 6),
            "features_count":       len(self._baseline_features),
        }
