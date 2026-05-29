"""
Agent d'Enrichissement — Pipeline CLI

Usage : python -m src.data_agent.pipeline
"""
from __future__ import annotations
from pathlib import Path

import pandas as pd

from src.data_agent.enricher import DatasetEnricher, ENRICHER_PATH

FEATURES_IN  = Path("data/generated/features.parquet")
FEATURES_OUT = Path("data/generated/features_enriched.parquet")


def run(
    input_path: Path = FEATURES_IN,
    output_path: Path = FEATURES_OUT,
    enricher_path: Path = ENRICHER_PATH,
) -> pd.DataFrame:

    # ── 1. Charger ────────────────────────────────────────────────────────────
    print(f"Chargement → {input_path}")
    df = pd.read_parquet(input_path)
    df["timestamp"] = pd.to_datetime(df["timestamp"])
    print(f"  {len(df):,} lignes | {df.shape[1]} colonnes")

    # ── 2. Split temporel ─────────────────────────────────────────────────────
    cutoff   = df["timestamp"].max() - pd.Timedelta(weeks=2)
    train_df = df[df["timestamp"] <= cutoff].copy()
    test_df  = df[df["timestamp"] >  cutoff].copy()
    print(f"\nSplit → train : {len(train_df):,} | test : {len(test_df):,}")

    # ── 3. Fit sur le train uniquement ────────────────────────────────────────
    print()
    enricher = DatasetEnricher()
    enricher.fit(train_df)

    # ── 4. Transformer le dataset complet ─────────────────────────────────────
    print("\nTransformation du dataset complet...")
    df_enriched = enricher.transform(df)

    # ── 5. Sauvegarder ────────────────────────────────────────────────────────
    output_path.parent.mkdir(parents=True, exist_ok=True)
    df_enriched.to_parquet(output_path, index=False)
    enricher.save(enricher_path)

    # ── 6. Résumé ─────────────────────────────────────────────────────────────
    nouvelles = enricher.output_cols
    print(f"\n{'='*50}")
    print(f"  Colonnes originales : {df.shape[1]}")
    print(f"  Nouvelles colonnes  : {len(nouvelles)}")
    print(f"  Total               : {df_enriched.shape[1]}")
    print(f"  Fichier enrichi     → {output_path}")
    print(f"{'='*50}")

    return df_enriched


def main() -> None:
    run()


if __name__ == "__main__":
    main()
