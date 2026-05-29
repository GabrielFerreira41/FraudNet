from __future__ import annotations
import numpy as np
import pandas as pd
from src.data_agent.base import FeatureBlock


class TemporalBlock(FeatureBlock):

    @property
    def name(self) -> str:
        return "temporal"

    @property
    def output_cols(self) -> list[str]:
        return ["heure_sin", "heure_cos", "jour_du_mois", "est_nuit_profonde", "semaine_annee"]

    def fit(self, df: pd.DataFrame) -> "TemporalBlock":
        return self

    def transform(self, df: pd.DataFrame) -> pd.DataFrame:
        df = df.copy()
        ts = pd.to_datetime(df["timestamp"])

        heure = ts.dt.hour
        df["heure_sin"]        = np.sin(2 * np.pi * heure / 24).astype(np.float32)
        df["heure_cos"]        = np.cos(2 * np.pi * heure / 24).astype(np.float32)
        df["jour_du_mois"]     = ts.dt.day.astype(np.int8)
        df["est_nuit_profonde"] = heure.between(0, 5).astype(np.int8)
        df["semaine_annee"]    = ts.dt.isocalendar().week.astype(np.int8)

        return df
