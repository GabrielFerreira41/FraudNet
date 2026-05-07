"""
Orchestre les trois modules de features et produit features.parquet + export Neo4j.
Usage : python -m src.features.feature_pipeline
"""
from __future__ import annotations
from pathlib import Path
import pandas as pd

from src.features.transaction_features import add_transaction_features
from src.features.temporal_features    import add_temporal_features
from src.features.graph_features       import add_graph_features, export_for_neo4j

TX_PATH       = Path("data/generated/transactions_labeled.parquet")
ACCOUNTS_PATH = Path("data/generated/accounts.parquet")
OUTPUT_PATH   = Path("data/generated/features.parquet")


def build_features(tx_path: Path, accounts_path: Path) -> pd.DataFrame:
    print("Chargement des données...")
    df  = pd.read_parquet(tx_path)
    acc = pd.read_parquet(accounts_path)
    df["timestamp"] = pd.to_datetime(df["timestamp"])

    print("→ Features transactionnelles...")
    df = add_transaction_features(df, acc)

    print("→ Features temporelles...")
    df = add_temporal_features(df)

    print("→ Features de graphe...")
    df = add_graph_features(df)

    print("→ Export Neo4j (CSV)...")
    export_for_neo4j(df, acc)

    return df


def main() -> None:
    df = build_features(TX_PATH, ACCOUNTS_PATH)

    fraud_count = df["is_fraud"].sum()
    print(f"\n--- Résultat ---")
    print(f"Transactions      : {len(df):,}")
    print(f"Fraudes           : {fraud_count:,} ({fraud_count/len(df)*100:.2f}%)")
    print(f"Features générées : {df.shape[1]} colonnes")
    print(f"\nColonnes : {list(df.columns)}")

    df.to_parquet(OUTPUT_PATH, index=False)
    print(f"\n✓ features.parquet → {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
