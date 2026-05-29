from __future__ import annotations
import numpy as np
import pandas as pd
from src.data_agent.base import FeatureBlock


class BehavioralBlock(FeatureBlock):

    @property
    def name(self) -> str:
        return "behavioral"

    @property
    def output_cols(self) -> list[str]:
        return ["z_score_montant", "nb_categories_30j", "nb_devices_30j"]

    # ── fit : apprend les stats par compte sur le train ──────────────────────

    def fit(self, df: pd.DataFrame) -> "BehavioralBlock":
        stats = df.groupby("account_id")["montant"].agg(["mean", "std"])

        # std peut être NaN si le compte a une seule transaction → on remplace par 1
        stats["std"] = stats["std"].fillna(1.0)

        self._account_mean = stats["mean"].to_dict()
        self._account_std  = stats["std"].to_dict()

        # Valeurs globales : utilisées pour les comptes inconnus (absent du train)
        self._global_mean = float(df["montant"].mean())
        self._global_std  = float(df["montant"].std())

        return self

    # ── transform : applique les features à n'importe quel split ─────────────

    def transform(self, df: pd.DataFrame) -> pd.DataFrame:
        df = df.copy()
        df = df.sort_values(["account_id", "timestamp"]).reset_index(drop=True)

        df["z_score_montant"] = self._compute_z_score(df)
        df["nb_categories_30j"] = self._rolling_distinct(df, col="categorie", window_days=30)
        df["nb_devices_30j"]    = self._rolling_distinct(df, col="device",    window_days=30)

        return df

    # ── helpers ──────────────────────────────────────────────────────────────

    def _compute_z_score(self, df: pd.DataFrame) -> pd.Series:
        mean = df["account_id"].map(self._account_mean).fillna(self._global_mean)
        std  = df["account_id"].map(self._account_std).fillna(self._global_std)
        return ((df["montant"] - mean) / std).clip(-10, 10).astype(np.float32)

    def _rolling_distinct(self, df: pd.DataFrame, col: str, window_days: int) -> pd.Series:
        window = f"{window_days}D"
        result = np.zeros(len(df), dtype=np.int16)

        for _, group in df.groupby("account_id", sort=False):
            g = group.set_index("timestamp").sort_index()

            # encode la colonne catégorielle en entiers pour rolling
            codes = g[col].astype("category").cat.codes.astype(float)
            counts = codes.rolling(window).apply(
                lambda x: len(np.unique(x)), raw=True
            )

            result[group.index] = counts.values.astype(np.int16)

        return pd.Series(result, index=df.index)
