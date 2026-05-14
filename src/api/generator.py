"""
Orchestrateur de génération de données — tâches de fond avec suivi de progression.
"""
from __future__ import annotations

import uuid
import time
import threading
from datetime import datetime
from pathlib import Path
from typing import Callable

import numpy as np
import pandas as pd

CONFIG_PATH   = Path("data/configs/profiles.yaml")
GEN_BASE_PATH = Path("data/generated")

_jobs: dict[str, dict] = {}


def _update(job: dict, step: str, pct: int, msg: str) -> None:
    job["step"]     = step
    job["progress"] = pct
    job["log"].append(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")


def get_job(job_id: str) -> dict | None:
    return _jobs.get(job_id)


def list_datasets() -> list[dict]:
    """Liste les datasets disponibles dans data/generated/."""
    datasets = []

    # Dataset principal
    main_accounts = GEN_BASE_PATH / "accounts.parquet"
    main_features = GEN_BASE_PATH / "features.parquet"
    if main_accounts.exists():
        acc = pd.read_parquet(main_accounts)
        stats: dict = {"n_accounts": len(acc), "n_transactions": None, "n_fraud": None}
        if main_features.exists():
            feat = pd.read_parquet(main_features, columns=["is_fraud"])
            stats["n_transactions"] = len(feat)
            stats["n_fraud"]        = int(feat["is_fraud"].sum())
        datasets.append({
            "id":      "main",
            "name":    "Dataset principal",
            "path":    str(GEN_BASE_PATH),
            "is_main": True,
            "stats":   stats,
            "created_at": datetime.fromtimestamp(main_accounts.stat().st_mtime).isoformat(),
        })

    # Datasets additionnels dans sous-dossiers
    for sub in sorted(GEN_BASE_PATH.iterdir()):
        if not sub.is_dir():
            continue
        acc_path  = sub / "accounts.parquet"
        feat_path = sub / "features.parquet"
        if not acc_path.exists():
            continue
        acc = pd.read_parquet(acc_path)
        stats2: dict = {"n_accounts": len(acc), "n_transactions": None, "n_fraud": None}
        if feat_path.exists():
            feat2 = pd.read_parquet(feat_path, columns=["is_fraud"])
            stats2["n_transactions"] = len(feat2)
            stats2["n_fraud"]        = int(feat2["is_fraud"].sum())
        datasets.append({
            "id":      sub.name,
            "name":    sub.name,
            "path":    str(sub),
            "is_main": False,
            "stats":   stats2,
            "created_at": datetime.fromtimestamp(acc_path.stat().st_mtime).isoformat(),
        })

    return datasets


def start_generation(params: dict) -> str:
    job_id = str(uuid.uuid4())[:8]
    job = {
        "id":       job_id,
        "status":   "running",
        "step":     "init",
        "progress": 0,
        "log":      [],
        "result":   None,
        "error":    None,
        "params":   params,
        "started_at": datetime.now().isoformat(),
    }
    _jobs[job_id] = job

    thread = threading.Thread(target=_run, args=(job,), daemon=True)
    thread.start()
    return job_id


def _run(job: dict) -> None:
    import tempfile, shutil
    from src.simulator.profile_generator import generate_accounts, accounts_to_dataframe
    from src.simulator.transaction_engine import generate_transactions
    from src.simulator.fraud_injector import inject_fraud
    from src.features.feature_pipeline import build_features

    params = job["params"]
    seed   = int(params.get("seed", 42))
    tmp    = Path(tempfile.mkdtemp(prefix="fraudnet_gen_"))

    try:
        # ── Step 1 : Comptes ────────────────────────────────────────────────
        _update(job, "accounts", 5, f"Génération de {params['n_accounts']} comptes…")
        arch_weights = params.get("archetype_weights") or None
        accounts = generate_accounts(
            n=int(params["n_accounts"]),
            config_path=CONFIG_PATH,
            seed=seed,
            archetype_weights=arch_weights,
        )
        acc_df = accounts_to_dataframe(accounts)
        acc_path = tmp / "accounts.parquet"
        acc_df.to_parquet(acc_path, index=False)
        arch_counts = acc_df["archetype"].value_counts().to_dict()
        _update(job, "accounts", 20,
            f"✓ {len(acc_df)} comptes générés — {arch_counts}")

        # ── Step 2 : Transactions ───────────────────────────────────────────
        weeks = int(params.get("weeks", 13))
        _update(job, "transactions", 22, f"Génération des transactions ({weeks} semaines)…")
        tx_path_raw = tmp / "transactions.parquet"
        tx_df = generate_transactions(acc_path, weeks=weeks, seed=seed)
        tx_df.to_parquet(tx_path_raw, index=False)
        _update(job, "transactions", 55,
            f"✓ {len(tx_df):,} transactions générées ({tx_df['montant'].mean():.0f} $ moy.)")

        # ── Step 3 : Injection de fraude ────────────────────────────────────
        fraud_rate  = float(params.get("fraud_rate", 0.03))
        fraud_types = params.get("fraud_types") or None
        _update(job, "fraud", 57,
            f"Injection de fraude (taux={fraud_rate*100:.1f}%)…")
        labeled_path = tmp / "transactions_labeled.parquet"
        labeled_df = inject_fraud(tx_path_raw, acc_path, fraud_rate, seed, fraud_types)
        labeled_df.to_parquet(labeled_path, index=False)
        n_fraud = int(labeled_df["is_fraud"].sum())
        _update(job, "fraud", 70,
            f"✓ {n_fraud} fraudes injectées / {len(labeled_df):,} transactions")

        # ── Step 4 : Feature pipeline ───────────────────────────────────────
        _update(job, "features", 72, "Calcul des features ML…")
        feat_path = tmp / "features.parquet"

        # build_features calls export_for_neo4j; skip by patching the import
        import src.features.feature_pipeline as fp_mod
        _orig_neo4j = fp_mod.export_for_neo4j

        def _noop_neo4j(*a, **kw):
            pass
        fp_mod.export_for_neo4j = _noop_neo4j
        try:
            feat_df = build_features(labeled_path, acc_path)
        finally:
            fp_mod.export_for_neo4j = _orig_neo4j

        feat_df.to_parquet(feat_path, index=False)
        _update(job, "features", 88,
            f"✓ {feat_df.shape[1]} features calculées pour {len(feat_df):,} transactions")

        # ── Step 5 : Destination ───────────────────────────────────────────
        destination = params.get("destination", "new")
        dataset_name = (params.get("dataset_name") or f"dataset_{job['id']}").strip()
        # Sanitize name
        dataset_name = "".join(c for c in dataset_name if c.isalnum() or c in "_-").strip("_-") or f"dataset_{job['id']}"

        _update(job, "saving", 90, f"Sauvegarde → {destination}…")

        if destination == "merge":
            _merge_into_main(acc_df, labeled_df, feat_df)
            out_path = str(GEN_BASE_PATH)
            _update(job, "saving", 97, "✓ Fusionné dans le dataset principal")
        else:
            out_dir = GEN_BASE_PATH / dataset_name
            out_dir.mkdir(parents=True, exist_ok=True)
            acc_df.to_parquet(out_dir / "accounts.parquet", index=False)
            labeled_df.to_parquet(out_dir / "transactions_labeled.parquet", index=False)
            feat_df.to_parquet(out_dir / "features.parquet", index=False)
            out_path = str(out_dir)
            _update(job, "saving", 97, f"✓ Sauvegardé dans {out_dir}")

        # ── Done ───────────────────────────────────────────────────────────
        job["result"] = {
            "n_accounts":     len(acc_df),
            "n_transactions": len(labeled_df),
            "n_fraud":        n_fraud,
            "fraud_rate":     round(n_fraud / max(len(labeled_df), 1), 6),
            "n_features":     feat_df.shape[1],
            "archetype_counts": arch_counts,
            "destination":    destination,
            "dataset_name":   dataset_name if destination == "new" else "main",
            "out_path":       out_path,
            "weeks":          weeks,
        }
        job["status"]   = "done"
        job["progress"] = 100
        job["step"]     = "done"
        _update(job, "done", 100, "✅ Génération terminée")

    except Exception as exc:
        import traceback
        job["status"] = "error"
        job["error"]  = str(exc)
        job["log"].append(f"[ERREUR] {traceback.format_exc()}")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def _merge_into_main(
    new_acc:  pd.DataFrame,
    new_tx:   pd.DataFrame,
    new_feat: pd.DataFrame,
) -> None:
    """Append new data to the main parquet files."""
    GEN_BASE_PATH.mkdir(parents=True, exist_ok=True)

    acc_path  = GEN_BASE_PATH / "accounts.parquet"
    tx_path   = GEN_BASE_PATH / "transactions_labeled.parquet"
    feat_path = GEN_BASE_PATH / "features.parquet"

    if acc_path.exists():
        old_acc = pd.read_parquet(acc_path)
        acc_merged = pd.concat([old_acc, new_acc], ignore_index=True).drop_duplicates("account_id")
    else:
        acc_merged = new_acc
    acc_merged.to_parquet(acc_path, index=False)

    if tx_path.exists():
        old_tx = pd.read_parquet(tx_path)
        tx_merged = pd.concat([old_tx, new_tx], ignore_index=True).drop_duplicates("transaction_id")
        tx_merged = tx_merged.sort_values("timestamp").reset_index(drop=True)
    else:
        tx_merged = new_tx
    tx_merged.to_parquet(tx_path, index=False)

    if feat_path.exists():
        old_feat = pd.read_parquet(feat_path)
        feat_merged = pd.concat([old_feat, new_feat], ignore_index=True).drop_duplicates("transaction_id")
    else:
        feat_merged = new_feat
    feat_merged.to_parquet(feat_path, index=False)
