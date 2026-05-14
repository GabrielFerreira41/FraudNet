"""
Injecte des scénarios de fraude réalistes dans le flux de transactions légitimes.
Usage : python -m src.simulator.fraud_injector --rate 0.03 --seed 42
"""

from __future__ import annotations

import argparse
import uuid
from pathlib import Path

import numpy as np
import pandas as pd

INPUT_PATH  = Path(__file__).parents[2] / "data" / "generated" / "transactions.parquet"
OUTPUT_PATH = Path(__file__).parents[2] / "data" / "generated" / "transactions_labeled.parquet"
ACCOUNTS_PATH = Path(__file__).parents[2] / "data" / "generated" / "accounts.parquet"


# ---------------------------------------------------------------------------
# Scénarios de fraude
# ---------------------------------------------------------------------------

def _carte_volee(df: pd.DataFrame, account_ids: list[str], rng: np.random.Generator) -> pd.DataFrame:
    """
    Achats inhabituels (montant élevé, commerçant nouveau, horaire anormal)
    sur un court laps de temps — simule une carte physique volée.
    """
    rows = []
    for account_id in account_ids:
        historique = df[df["account_id"] == account_id]
        if historique.empty:
            continue

        montant_habituel = historique["montant"].mean()
        ville_habituelle = historique["ville_tx"].mode().iloc[0]
        ref_ts = historique["timestamp"].sample(1, random_state=int(rng.integers(9999))).iloc[0]

        n_tx = int(rng.integers(3, 7))
        for i in range(n_tx):
            ts = ref_ts + pd.Timedelta(minutes=int(rng.integers(5, 40)) * (i + 1))
            rows.append({
                "transaction_id": str(uuid.uuid4()),
                "account_id":     account_id,
                "archetype":      historique.iloc[0]["archetype"],
                "timestamp":      ts,
                "montant":        round(float(rng.uniform(montant_habituel * 3, montant_habituel * 8)), 2),
                "commercant":     rng.choice(["Best Buy", "Apple Store", "Zara", "Sport Chek", "Simons"]),
                "categorie":      "vetements",
                "device":         rng.choice(["mobile", "desktop"]),
                "ville_tx":       rng.choice(["Toronto", "Vancouver", "Calgary"]) if ville_habituelle == "Montreal" else "Montreal",
                "est_weekend":    ts.dayofweek >= 5,
                "heure":          int(ts.hour),
                "jour_semaine":   ts.dayofweek,
                "is_fraud":       True,
                "fraud_type":     "carte_volee",
            })
    return pd.DataFrame(rows)


def _test_carte(df: pd.DataFrame, account_ids: list[str], rng: np.random.Generator) -> pd.DataFrame:
    """
    Micro-transactions (1–2$) en rafale sur plusieurs sites pour tester
    si la carte est valide avant un gros achat.
    """
    rows = []
    for account_id in account_ids:
        historique = df[df["account_id"] == account_id]
        if historique.empty:
            continue

        ref_ts = historique["timestamp"].sample(1, random_state=int(rng.integers(9999))).iloc[0]
        n_tests = int(rng.integers(4, 9))

        for i in range(n_tests):
            ts = ref_ts + pd.Timedelta(minutes=int(rng.integers(1, 5)) * (i + 1))
            rows.append({
                "transaction_id": str(uuid.uuid4()),
                "account_id":     account_id,
                "archetype":      historique.iloc[0]["archetype"],
                "timestamp":      ts,
                "montant":        round(float(rng.uniform(0.50, 2.00)), 2),
                "commercant":     rng.choice(["Spotify", "Netflix", "Steam", "Epic Games", "App Store"]),
                "categorie":      "divertissement",
                "device":         "mobile",
                "ville_tx":       historique.iloc[0]["ville_tx"],
                "est_weekend":    ts.dayofweek >= 5,
                "heure":          int(ts.hour),
                "jour_semaine":   ts.dayofweek,
                "is_fraud":       True,
                "fraud_type":     "test_carte",
            })

        # Gros achat final qui suit les tests
        ts_final = ref_ts + pd.Timedelta(minutes=int(rng.integers(30, 90)))
        montant_habituel = historique["montant"].mean()
        rows.append({
            "transaction_id": str(uuid.uuid4()),
            "account_id":     account_id,
            "archetype":      historique.iloc[0]["archetype"],
            "timestamp":      ts_final,
            "montant":        round(float(rng.uniform(montant_habituel * 5, montant_habituel * 12)), 2),
            "commercant":     "Best Buy",
            "categorie":      "equipement",
            "device":         "mobile",
            "ville_tx":       historique.iloc[0]["ville_tx"],
            "est_weekend":    ts_final.dayofweek >= 5,
            "heure":          int(ts_final.hour),
            "jour_semaine":   ts_final.dayofweek,
            "is_fraud":       True,
            "fraud_type":     "test_carte",
        })

    return pd.DataFrame(rows)


def _prise_de_compte(df: pd.DataFrame, account_ids: list[str], rng: np.random.Generator) -> pd.DataFrame:
    """
    Connexion depuis un nouveau device → gros virement sortant immédiat.
    """
    rows = []
    for account_id in account_ids:
        historique = df[df["account_id"] == account_id]
        if historique.empty:
            continue

        device_habituel = historique["device"].mode().iloc[0]
        nouveau_device = "desktop" if device_habituel == "mobile" else "mobile"
        montant_habituel = historique["montant"].mean()

        ref_ts = historique["timestamp"].sample(1, random_state=int(rng.integers(9999))).iloc[0]
        ts = ref_ts + pd.Timedelta(hours=int(rng.integers(1, 6)))

        rows.append({
            "transaction_id": str(uuid.uuid4()),
            "account_id":     account_id,
            "archetype":      historique.iloc[0]["archetype"],
            "timestamp":      ts,
            "montant":        round(float(rng.uniform(montant_habituel * 10, montant_habituel * 20)), 2),
            "commercant":     "Virement e-Transfer",
            "categorie":      "autre",
            "device":         nouveau_device,
            "ville_tx":       rng.choice(["Toronto", "Vancouver", "Calgary", "Winnipeg"]),
            "est_weekend":    ts.dayofweek >= 5,
            "heure":          int(ts.hour),
            "jour_semaine":   ts.dayofweek,
            "is_fraud":       True,
            "fraud_type":     "prise_de_compte",
        })
    return pd.DataFrame(rows)


def _reseau_mules(df: pd.DataFrame, account_groups: list[list[str]], rng: np.random.Generator) -> pd.DataFrame:
    """
    Un compte 'collecteur' reçoit de petits virements de N comptes 'mules'
    en rafale sur une courte période.
    """
    rows = []
    for group in account_groups:
        if len(group) < 3:
            continue

        collecteur_id = group[0]
        mules = group[1:]

        historique_collecteur = df[df["account_id"] == collecteur_id]
        if historique_collecteur.empty:
            continue

        ref_ts = historique_collecteur["timestamp"].sample(
            1, random_state=int(rng.integers(9999))
        ).iloc[0]

        for i, mule_id in enumerate(mules):
            ts = ref_ts + pd.Timedelta(minutes=int(rng.integers(2, 15)) * (i + 1))
            rows.append({
                "transaction_id": str(uuid.uuid4()),
                "account_id":     mule_id,
                "archetype":      df[df["account_id"] == mule_id]["archetype"].iloc[0] if not df[df["account_id"] == mule_id].empty else "autre",
                "timestamp":      ts,
                "montant":        round(float(rng.uniform(200, 900)), 2),
                "commercant":     "Virement e-Transfer",
                "categorie":      "autre",
                "device":         "mobile",
                "ville_tx":       historique_collecteur.iloc[0]["ville_tx"],
                "est_weekend":    ts.dayofweek >= 5,
                "heure":          int(ts.hour),
                "jour_semaine":   ts.dayofweek,
                "is_fraud":       True,
                "fraud_type":     "reseau_mules",
            })

    return pd.DataFrame(rows)


def _structuration(df: pd.DataFrame, account_ids: list[str], rng: np.random.Generator) -> pd.DataFrame:
    """
    Fractionnement d'un gros montant en petits virements juste sous le seuil
    de déclaration obligatoire (10 000 $ au Canada).
    """
    rows = []
    for account_id in account_ids:
        historique = df[df["account_id"] == account_id]
        if historique.empty:
            continue

        montant_total = float(rng.uniform(9000, 25000))
        seuil = 9500.0
        n_tx = int(np.ceil(montant_total / seuil))

        ref_ts = historique["timestamp"].sample(1, random_state=int(rng.integers(9999))).iloc[0]

        for i in range(n_tx):
            ts = ref_ts + pd.Timedelta(hours=int(rng.integers(2, 12)) * (i + 1))
            part = min(seuil - float(rng.uniform(100, 400)), montant_total)
            montant_total -= part
            rows.append({
                "transaction_id": str(uuid.uuid4()),
                "account_id":     account_id,
                "archetype":      historique.iloc[0]["archetype"],
                "timestamp":      ts,
                "montant":        round(max(part, 100.0), 2),
                "commercant":     "Virement e-Transfer",
                "categorie":      "autre",
                "device":         historique["device"].mode().iloc[0],
                "ville_tx":       historique.iloc[0]["ville_tx"],
                "est_weekend":    ts.dayofweek >= 5,
                "heure":          int(ts.hour),
                "jour_semaine":   ts.dayofweek,
                "is_fraud":       True,
                "fraud_type":     "structuration",
            })

    return pd.DataFrame(rows)


# ---------------------------------------------------------------------------
# Orchestrateur
# ---------------------------------------------------------------------------

DEFAULT_SCENARIO_SPLIT = {
    "carte_volee":      0.30,
    "test_carte":       0.25,
    "prise_de_compte":  0.20,
    "reseau_mules":     0.15,
    "structuration":    0.10,
}


def inject_fraud(
    transactions_path: Path,
    accounts_path: Path,
    fraud_rate: float,
    seed: int,
    fraud_types: dict[str, float] | None = None,
) -> pd.DataFrame:
    """
    fraud_types: dict mapping scenario name → relative weight.
    If None, uses DEFAULT_SCENARIO_SPLIT.
    """
    rng = np.random.default_rng(seed)

    df   = pd.read_parquet(transactions_path)
    acc  = pd.read_parquet(accounts_path)

    df["timestamp"] = pd.to_datetime(df["timestamp"])

    all_account_ids = df["account_id"].unique().tolist()
    vulnerable_ids  = acc[acc["est_vulnerabilite"]]["account_id"].tolist()

    n_total  = len(all_account_ids)
    n_fraude = max(1, int(n_total * fraud_rate))

    # Build normalised scenario split from caller or default
    raw_split = fraud_types if fraud_types else DEFAULT_SCENARIO_SPLIT
    total_w   = sum(raw_split.values()) or 1.0
    scenario_split = {k: v / total_w for k, v in raw_split.items() if v > 0}

    fraud_frames: list[pd.DataFrame] = []

    # Priorité aux comptes vulnérables (60%), reste aléatoire
    pool_vuln   = [a for a in vulnerable_ids if a in all_account_ids]
    pool_normal = [a for a in all_account_ids if a not in pool_vuln]

    def _pick(n: int) -> list[str]:
        n_vuln = min(int(n * 0.6), len(pool_vuln))
        n_norm = n - n_vuln
        chosen = list(rng.choice(pool_vuln, size=n_vuln, replace=False)) if n_vuln else []
        chosen += list(rng.choice(pool_normal, size=min(n_norm, len(pool_normal)), replace=False))
        return chosen

    for scenario, weight in scenario_split.items():
        n = max(1, int(n_fraude * weight))
        print(f"  [{scenario}] → {n} comptes ciblés")

        if scenario == "carte_volee":
            fraud_frames.append(_carte_volee(df, _pick(n), rng))
        elif scenario == "test_carte":
            fraud_frames.append(_test_carte(df, _pick(n), rng))
        elif scenario == "prise_de_compte":
            fraud_frames.append(_prise_de_compte(df, _pick(n), rng))
        elif scenario == "reseau_mules":
            groups = [_pick(int(rng.integers(3, 7))) for _ in range(max(1, n // 4))]
            fraud_frames.append(_reseau_mules(df, groups, rng))
        elif scenario == "structuration":
            fraud_frames.append(_structuration(df, _pick(n), rng))

    fraud_df = pd.concat([f for f in fraud_frames if not f.empty], ignore_index=True)

    combined = pd.concat([df, fraud_df], ignore_index=True)
    combined = combined.sort_values("timestamp").reset_index(drop=True)

    return combined


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Injecte des transactions frauduleuses.")
    parser.add_argument("--rate",   type=float, default=0.03,         help="Taux de fraude cible (ex: 0.03 = 3%)")
    parser.add_argument("--seed",   type=int,   default=42,           help="Graine aléatoire")
    parser.add_argument("--output", type=Path,  default=OUTPUT_PATH,  help="Chemin de sortie")
    args = parser.parse_args()

    print(f"Injection de fraude (rate={args.rate}, seed={args.seed})...")
    df = inject_fraud(INPUT_PATH, ACCOUNTS_PATH, args.rate, args.seed)

    total  = len(df)
    frauds = df["is_fraud"].sum()
    print(f"\n--- Résultat ---")
    print(f"Transactions totales : {total:,}")
    print(f"Fraudes injectées    : {frauds:,} ({frauds/total*100:.2f}%)")
    print(f"\nRépartition par scénario :")
    print(df[df["is_fraud"]]["fraud_type"].value_counts().to_string())

    df.to_parquet(args.output, index=False)
    print(f"\n✓ Sauvegardé → {args.output}")


if __name__ == "__main__":
    main()
