"""
Pré-calcule les scores GNN (G1/G2/G3) par compte et les sauvegarde en parquet.
À re-exécuter après chaque ré-entraînement des modèles graphe.

Usage : python -m src.detection.graph.precompute

Sortie : reports/gnn_account_scores.parquet
  account_id | score_g1 | score_g2 | score_g3
"""
from __future__ import annotations
from pathlib import Path

import pandas as pd

FEATURES_PATH = Path("data/generated/features.parquet")
OUTPUT_PATH   = Path("reports/gnn_account_scores.parquet")


def main() -> None:
    # Imports PyTorch ici — le script tourne SANS LightGBM pour éviter le conflit libomp
    from src.detection.graph.device_sharing import score as score_g1
    from src.detection.graph.merchant       import score as score_g2
    from src.detection.graph.temporal       import score as score_g3

    print("Pré-calcul des scores GNN par compte…")
    df = pd.read_parquet(FEATURES_PATH)

    print("  G1 Device Sharing (GraphSAGE)…")
    s_g1 = score_g1(df)

    print("  G2 Merchant Targeting (GAT bipartite)…")
    s_g2 = score_g2(df)

    print("  G3 Temporal Velocity (GCN pondéré)…")
    s_g3 = score_g3(df)

    tmp = df[["account_id"]].copy()
    tmp["s_g1"] = s_g1
    tmp["s_g2"] = s_g2
    tmp["s_g3"] = s_g3

    # Pire cas par compte (max sur toutes ses transactions)
    account_scores = (
        tmp.groupby("account_id")
        .agg(score_g1=("s_g1", "max"),
             score_g2=("s_g2", "max"),
             score_g3=("s_g3", "max"))
        .reset_index()
    )

    OUTPUT_PATH.parent.mkdir(exist_ok=True)
    account_scores.to_parquet(OUTPUT_PATH, index=False)
    print(f"  ✓ {len(account_scores)} comptes → {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
