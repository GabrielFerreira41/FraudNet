from __future__ import annotations
import numpy as np
import pandas as pd
from src.data_agent.base import FeatureBlock


class InteractionBlock(FeatureBlock):

    @property
    def name(self) -> str:
        return "interaction"

    @property
    def output_cols(self) -> list[str]:
        return ["montant_x_heure_suspecte", "vitesse_escalade"]

    def fit(self, df: pd.DataFrame) -> "InteractionBlock":
        return self

    def transform(self, df: pd.DataFrame) -> pd.DataFrame:
        df = df.copy()

        df["montant_x_heure_suspecte"] = (
            df["montant"] * df["heure_inhabituelle"]
        ).astype(np.float32)

        df["vitesse_escalade"] = (
            df["velocite_1h"] / (df["velocite_24h"] / 24 + 1e-3)
        ).clip(0, 50).astype(np.float32)

        return df
