"""
Injecte uniquement les nouveaux scénarios de fraude dans le dataset existant.
Ne régénère PAS les comptes ni les transactions légitimes.
Ajoute les nouvelles fraudes par-dessus ce qui existe déjà.

Usage :
  python -m src.simulator.inject_extra_fraud
  python -m src.simulator.inject_extra_fraud --rate 0.01 --seed 99
"""
from __future__ import annotations

import argparse
import numpy as np
import pandas as pd
from pathlib import Path

LABELED_PATH  = Path("data/generated/transactions_labeled.parquet")
ACCOUNTS_PATH = Path("data/generated/accounts.parquet")
FEATURES_PATH = Path("data/generated/features.parquet")

NEW_SCENARIOS = {
    "sim_swap":         0.25,
    "phishing":         0.25,
    "fraude_aines":     0.15,
    "skimming":         0.20,
    "fraude_ecommerce": 0.15,
}


def run(seed: int = 99, rate: float = 0.01) -> None:
    from src.simulator.fraud_injector import (
        _sim_swap, _phishing, _fraude_aines, _skimming, _fraude_ecommerce,
    )

    print("Chargement du dataset existant…")
    labeled = pd.read_parquet(LABELED_PATH)
    acc     = pd.read_parquet(ACCOUNTS_PATH)
    labeled["timestamp"] = pd.to_datetime(labeled["timestamp"])

    # On utilise uniquement les transactions légitimes comme contexte de l'injecteur
    legit = labeled[~labeled["is_fraud"]].copy()

    all_ids  = legit["account_id"].unique().tolist()
    n_fraude = max(1, int(len(legit) * rate))
    total_w  = sum(NEW_SCENARIOS.values())
    rng      = np.random.default_rng(seed)

    print(f"  {len(labeled):,} transactions existantes "
          f"({labeled['is_fraud'].sum():,} fraudes)")
    print(f"  Objectif : ~{n_fraude:,} nouvelles fraudes "
          f"(rate={rate*100:.1f}%)\n")

    frames = []
    for scenario, weight in NEW_SCENARIOS.items():
        n       = max(1, int(n_fraude * weight / total_w))
        targets = list(
            rng.choice(all_ids, size=min(n, len(all_ids)), replace=False)
        )
        print(f"  [{scenario}] → {n} comptes ciblés")

        if scenario == "sim_swap":
            frames.append(_sim_swap(legit, targets, rng))
        elif scenario == "phishing":
            frames.append(_phishing(legit, targets, rng))
        elif scenario == "fraude_aines":
            frames.append(_fraude_aines(legit, acc, targets, rng))
        elif scenario == "skimming":
            frames.append(_skimming(legit, targets, rng))
        elif scenario == "fraude_ecommerce":
            frames.append(_fraude_ecommerce(legit, targets, rng))

    new_fraud = pd.concat([f for f in frames if not f.empty], ignore_index=True)
    print(f"\n✓ {len(new_fraud):,} transactions frauduleuses générées")
    print(new_fraud["fraud_type"].value_counts().to_string())

    # ── Fusion avec l'existant ────────────────────────────────────────────────
    combined = (
        pd.concat([labeled, new_fraud], ignore_index=True)
        .sort_values("timestamp")
        .reset_index(drop=True)
    )
    combined.to_parquet(LABELED_PATH, index=False)

    total_fraud = combined["is_fraud"].sum()
    print(f"\n✓ Dataset mis à jour → {LABELED_PATH}")
    print(f"  {len(combined):,} transactions total  |  "
          f"{total_fraud:,} fraudes ({total_fraud/len(combined)*100:.2f}%)")
    print("\nRépartition finale par scénario :")
    print(combined[combined["is_fraud"]]["fraud_type"].value_counts().to_string())

    # ── Recalcul des features ─────────────────────────────────────────────────
    print("\nRecalcul des features ML (pipeline complet)…")
    import src.features.feature_pipeline as fp_mod
    _orig = fp_mod.export_for_neo4j
    fp_mod.export_for_neo4j = lambda *a, **kw: None
    try:
        feat_df = fp_mod.build_features(LABELED_PATH, ACCOUNTS_PATH)
    finally:
        fp_mod.export_for_neo4j = _orig

    feat_df.to_parquet(FEATURES_PATH, index=False)
    print(f"✓ Features → {FEATURES_PATH} "
          f"({len(feat_df):,} lignes, {feat_df.shape[1]} colonnes)")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Injecte les nouveaux scénarios de fraude dans le dataset existant."
    )
    parser.add_argument("--rate", type=float, default=0.01,
                        help="Taux de fraude à injecter sur les tx légitimes (défaut : 0.01 = 1%%)")
    parser.add_argument("--seed", type=int, default=99,
                        help="Graine aléatoire pour reproducibilité")
    args = parser.parse_args()
    run(seed=args.seed, rate=args.rate)


if __name__ == "__main__":
    main()
