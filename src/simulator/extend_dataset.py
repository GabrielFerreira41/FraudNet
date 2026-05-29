"""
Étend le dataset existant sans rien écraser.
Génère nouveaux comptes + transactions légitimes + tous les scénarios de fraude,
puis fusionne avec data/generated/.

Usage :
  python -m src.simulator.extend_dataset
  python -m src.simulator.extend_dataset --n 300 --weeks 8 --rate 0.03 --seed 99
"""
from __future__ import annotations

import argparse
import shutil
import tempfile
from pathlib import Path

import pandas as pd

GEN_PATH    = Path("data/generated")
CONFIG_PATH = Path("data/configs/profiles.yaml")


# ---------------------------------------------------------------------------
# Fusion
# ---------------------------------------------------------------------------

def _merge_file(path: Path, new_df: pd.DataFrame, key: str) -> None:
    if path.exists():
        old    = pd.read_parquet(path)
        merged = pd.concat([old, new_df], ignore_index=True).drop_duplicates(key)
    else:
        merged = new_df
    if "timestamp" in merged.columns:
        merged["timestamp"] = pd.to_datetime(merged["timestamp"])
        merged = merged.sort_values("timestamp").reset_index(drop=True)
    merged.to_parquet(path, index=False)
    print(f"  ✓ {path.name} → {len(merged):,} lignes")


# ---------------------------------------------------------------------------
# Pipeline principal
# ---------------------------------------------------------------------------

def run(n: int = 300, weeks: int = 8, seed: int = 99, rate: float = 0.03) -> None:
    from src.simulator.profile_generator import generate_accounts, accounts_to_dataframe
    from src.simulator.transaction_engine import generate_transactions
    from src.simulator.fraud_injector import inject_fraud
    import src.features.feature_pipeline as fp_mod

    tmp = Path(tempfile.mkdtemp(prefix="fraudnet_extend_"))
    try:
        # ── Étape 1 : Nouveaux comptes ────────────────────────────────────────
        print(f"\n[1/5] Génération de {n} nouveaux comptes (seed={seed})…")
        accounts = generate_accounts(n=n, config_path=CONFIG_PATH, seed=seed)
        acc_df   = accounts_to_dataframe(accounts)
        acc_path = tmp / "accounts.parquet"
        acc_df.to_parquet(acc_path, index=False)
        print(f"  ✓ {len(acc_df)} comptes | archetypes : "
              f"{acc_df['archetype'].value_counts().to_dict()}")

        # ── Étape 2 : Transactions légitimes ──────────────────────────────────
        print(f"\n[2/5] Génération des transactions légitimes ({weeks} semaines)…")
        tx_df   = generate_transactions(acc_path, weeks=weeks, seed=seed)
        tx_path = tmp / "transactions.parquet"
        tx_df.to_parquet(tx_path, index=False)
        print(f"  ✓ {len(tx_df):,} transactions "
              f"(montant moyen : {tx_df['montant'].mean():.0f} $)")

        # ── Étape 3 : Injection de fraude (tous scénarios) ────────────────────
        print(f"\n[3/5] Injection de fraude (taux={rate*100:.1f}%, tous scénarios)…")
        labeled_df   = inject_fraud(tx_path, acc_path, fraud_rate=rate, seed=seed)
        labeled_path = tmp / "transactions_labeled.parquet"
        labeled_df.to_parquet(labeled_path, index=False)
        n_fraud = int(labeled_df["is_fraud"].sum())
        print(f"  ✓ {n_fraud:,} fraudes / {len(labeled_df):,} transactions")
        print("  Répartition :")
        for ftype, cnt in labeled_df[labeled_df["is_fraud"]]["fraud_type"].value_counts().items():
            print(f"    {ftype:<20} {cnt:>5}")

        # ── Étape 4 : Features ML ─────────────────────────────────────────────
        print("\n[4/5] Calcul des features ML…")
        _orig = fp_mod.export_for_neo4j
        fp_mod.export_for_neo4j = lambda *a, **kw: None
        try:
            feat_df = fp_mod.build_features(labeled_path, acc_path)
        finally:
            fp_mod.export_for_neo4j = _orig
        feat_path = tmp / "features.parquet"
        feat_df.to_parquet(feat_path, index=False)
        print(f"  ✓ {feat_df.shape[1]} features pour {len(feat_df):,} transactions")

        # ── Étape 5 : Fusion avec le dataset principal ────────────────────────
        print("\n[5/5] Fusion avec le dataset principal…")
        GEN_PATH.mkdir(parents=True, exist_ok=True)
        _merge_file(GEN_PATH / "accounts.parquet",               acc_df,    "account_id")
        _merge_file(GEN_PATH / "transactions_labeled.parquet",   labeled_df,"transaction_id")
        _merge_file(GEN_PATH / "features.parquet",               feat_df,   "transaction_id")

        # ── Bilan final ───────────────────────────────────────────────────────
        print("\n" + "─" * 52)
        print("✅  Dataset étendu avec succès")
        print("─" * 52)
        final = pd.read_parquet(
            GEN_PATH / "features.parquet",
            columns=["is_fraud", "fraud_type"],
        )
        total       = len(final)
        total_fraud = int(final["is_fraud"].sum())
        print(f"  Total transactions : {total:,}")
        print(f"  Fraudes            : {total_fraud:,} ({total_fraud/total*100:.2f}%)")
        print("\n  Répartition par scénario (dataset complet) :")
        for ftype, cnt in final[final["is_fraud"]]["fraud_type"].value_counts().items():
            pct = cnt / total_fraud * 100
            print(f"    {ftype:<22} {cnt:>6}  ({pct:.1f}%)")
        print("─" * 52)

    finally:
        shutil.rmtree(tmp, ignore_errors=True)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Étend le dataset FraudNet sans écraser les données existantes."
    )
    parser.add_argument("--n",     type=int,   default=300,
                        help="Nombre de nouveaux comptes (défaut : 300)")
    parser.add_argument("--weeks", type=int,   default=8,
                        help="Semaines de transactions à générer (défaut : 8)")
    parser.add_argument("--rate",  type=float, default=0.03,
                        help="Taux de fraude sur les nouvelles transactions (défaut : 0.03)")
    parser.add_argument("--seed",  type=int,   default=99,
                        help="Graine aléatoire (défaut : 99)")
    args = parser.parse_args()
    run(n=args.n, weeks=args.weeks, seed=args.seed, rate=args.rate)


if __name__ == "__main__":
    main()
