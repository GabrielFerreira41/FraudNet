from __future__ import annotations
from abc import ABC, abstractmethod

import pandas as pd


class FeatureBlock(ABC):

    @property
    @abstractmethod
    def name(self) -> str: ...

    @property
    @abstractmethod
    def output_cols(self) -> list[str]: ...

    @abstractmethod
    def fit(self, df: pd.DataFrame) -> "FeatureBlock": ...

    @abstractmethod
    def transform(self, df: pd.DataFrame) -> pd.DataFrame: ...

    def fit_transform(self, df: pd.DataFrame) -> pd.DataFrame:
        return self.fit(df).transform(df)
