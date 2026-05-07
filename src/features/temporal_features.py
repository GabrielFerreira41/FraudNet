"""
Features temporelles : vélocité, écarts comportementaux, fenêtres glissantes.
"""
from __future__ import annotations
import pandas as pd


def add_temporal_features(df: pd.DataFrame) -> pd.DataFrame:
    df = df.sort_values(["account_id", "timestamp"]).reset_index(drop=True)
    df["timestamp"] = pd.to_datetime(df["timestamp"])

    # --- Vélocité : nombre de transactions par compte dans les N dernières minutes ---
    df = df.set_index("timestamp")

    def _velocite(grp: pd.DataFrame, window: str) -> pd.Series:
        return grp.rolling(window, closed="left").count()["montant"]

    velocite_1h  = df.groupby("account_id", group_keys=False).apply(
        lambda g: _velocite(g, "1h")
    ).rename("velocite_1h")

    velocite_24h = df.groupby("account_id", group_keys=False).apply(
        lambda g: _velocite(g, "24h")
    ).rename("velocite_24h")

    # Montant cumulé sur 1h par compte
    def _montant_cumul(grp: pd.DataFrame, window: str) -> pd.Series:
        return grp["montant"].rolling(window, closed="left").sum()

    montant_cumul_1h = df.groupby("account_id", group_keys=False).apply(
        lambda g: _montant_cumul(g, "1h")
    ).rename("montant_cumul_1h")

    df = df.reset_index()

    df["velocite_1h"]      = velocite_1h.values
    df["velocite_24h"]     = velocite_24h.values
    df["montant_cumul_1h"] = montant_cumul_1h.values

    df["velocite_1h"]      = df["velocite_1h"].fillna(0).astype(int)
    df["velocite_24h"]     = df["velocite_24h"].fillna(0).astype(int)
    df["montant_cumul_1h"] = df["montant_cumul_1h"].fillna(0).round(2)

    # --- Écart au comportement habituel ---
    # Montant moyen roulant des 30 dernières transactions du compte
    df["montant_moy_30tx"] = (
        df.groupby("account_id")["montant"]
        .transform(lambda s: s.shift(1).rolling(30, min_periods=5).mean())
        .fillna(df["montant"])
        .round(2)
    )
    df["ecart_montant_30tx"] = ((df["montant"] - df["montant_moy_30tx"]) / df["montant_moy_30tx"]).round(4)

    # Délai depuis la dernière transaction du compte (en minutes)
    df["delta_min_prev_tx"] = (
        df.groupby("account_id")["timestamp"]
        .diff()
        .dt.total_seconds()
        .div(60)
        .fillna(-1)
        .round(1)
    )

    # Flag : rafale (moins de 5 minutes depuis la transaction précédente)
    df["est_rafale"] = ((df["delta_min_prev_tx"] > 0) & (df["delta_min_prev_tx"] < 5)).astype(int)

    return df
