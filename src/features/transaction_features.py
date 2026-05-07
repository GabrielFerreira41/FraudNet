"""
Features transactionnelles : anomalies par rapport au profil du compte.
"""
from __future__ import annotations
import ast
from pathlib import Path
import numpy as np
import pandas as pd

ACCOUNTS_PATH = Path(__file__).parents[2] / "data" / "generated" / "accounts.parquet"


def add_transaction_features(df: pd.DataFrame, accounts: pd.DataFrame) -> pd.DataFrame:
    acc = accounts[["account_id", "montant_moyen_transaction", "commercants_habituels",
                     "devices", "device_principal", "horaires_actifs"]].copy()

    df = df.merge(acc, on="account_id", how="left", suffixes=("", "_acc"))

    # Ratio montant vs moyenne du profil
    df["ratio_montant"] = (df["montant"] / df["montant_moyen_transaction"]).round(4)
    df["montant_anormal"] = (df["ratio_montant"] > 3.0).astype(int)

    # Commerçant inconnu (hors liste habituelle)
    def _est_nouveau_commercant(row):
        habituels = str(row["commercants_habituels"]).split("|")
        return int(row["commercant"] not in habituels)

    df["nouveau_commercant"] = df.apply(_est_nouveau_commercant, axis=1)

    # Device inhabituel
    def _est_nouveau_device(row):
        devices_connus = str(row["devices"]).split("|")
        return int(row["device"] not in devices_connus)

    df["nouveau_device"] = df.apply(_est_nouveau_device, axis=1)

    # Heure inhabituelle (hors créneaux actifs du profil)
    def _est_heure_inhabituelle(row):
        try:
            horaires = ast.literal_eval(row["horaires_actifs"])
            key = "weekend" if row["est_weekend"] else "jours_semaine"
            return int(int(row["heure"]) not in horaires[key])
        except Exception:
            return 0

    df["heure_inhabituelle"] = df.apply(_est_heure_inhabituelle, axis=1)

    # Score composite simple (0–4) — sera remplacé par le modèle
    df["score_anomalie_tx"] = (
        df["montant_anormal"] +
        df["nouveau_commercant"] +
        df["nouveau_device"] +
        df["heure_inhabituelle"]
    )

    drop_cols = ["montant_moyen_transaction", "commercants_habituels",
                 "devices", "device_principal", "horaires_actifs"]
    df = df.drop(columns=[c for c in drop_cols if c in df.columns])

    return df
