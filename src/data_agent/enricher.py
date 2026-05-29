from __future__ import annotations
import pickle
from pathlib import Path

import pandas as pd

from src.data_agent.base import FeatureBlock
from src.data_agent.temporal import TemporalBlock
from src.data_agent.behavioral import BehavioralBlock
from src.data_agent.interaction import InteractionBlock

ENRICHER_PATH = Path("models/enricher.pkl")


class DatasetEnricher:

    def __init__(self, blocks: list[FeatureBlock] | None = None) -> None:
        self.blocks = blocks or [
            TemporalBlock(),
            BehavioralBlock(),
            InteractionBlock(),
        ]

    # ── Apprentissage ─────────────────────────────────────────────────────────

    def fit(self, train_df: pd.DataFrame) -> "DatasetEnricher":
        print("Apprentissage des blocs...")
        for block in self.blocks:
            block.fit(train_df)
            print(f"  ✓ {block.name}")
        return self

    # ── Transformation ────────────────────────────────────────────────────────

    def transform(self, df: pd.DataFrame) -> pd.DataFrame:
        for block in self.blocks:
            n_before = df.shape[1]
            df = block.transform(df)
            n_added = df.shape[1] - n_before
            print(f"  {block.name:<12} +{n_added} colonnes → {df.shape[1]} total")
        return df

    def fit_transform(self, train_df: pd.DataFrame) -> pd.DataFrame:
        return self.fit(train_df).transform(train_df)

    # ── Persistance ───────────────────────────────────────────────────────────

    def save(self, path: Path = ENRICHER_PATH) -> None:
        path.parent.mkdir(exist_ok=True)
        with open(path, "wb") as f:
            pickle.dump(self, f)
        print(f"✓ Enricher sauvegardé → {path}")

    @classmethod
    def load(cls, path: Path = ENRICHER_PATH) -> "DatasetEnricher":
        with open(path, "rb") as f:
            enricher = pickle.load(f)
        print(f"✓ Enricher chargé ← {path}")
        return enricher

    # ── Utilitaires ───────────────────────────────────────────────────────────

    @property
    def output_cols(self) -> list[str]:
        cols = []
        for block in self.blocks:
            cols.extend(block.output_cols)
        return cols

    def __repr__(self) -> str:
        bloc_names = [b.name for b in self.blocks]
        n_cols = len(self.output_cols)
        return f"DatasetEnricher(blocs={bloc_names}, +{n_cols} colonnes)"
