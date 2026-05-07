"""
Génère un flux de transactions légitimes à partir des comptes synthétiques.
Usage : python -m src.simulator.transaction_engine --weeks 13 --seed 42
"""

from __future__ import annotations

import argparse
import ast
import uuid
from itertools import chain
from pathlib import Path

import numpy as np
import pandas as pd

ACCOUNTS_PATH = Path(__file__).parents[2] / "data" / "generated" / "accounts.parquet"
OUTPUT_PATH   = Path(__file__).parents[2] / "data" / "generated" / "transactions.parquet"

# ---------------------------------------------------------------------------
# Référentiels
# ---------------------------------------------------------------------------

_COMMERCANTS_PAR_CATEGORIE: dict[str, list[str]] = {
    "epicerie":         ["IGA", "Metro", "Loblaws", "Maxi", "Provigo", "Costco", "Super C"],
    "restauration":     ["Tim Hortons", "McDonald's", "Subway", "Pizza Pizza", "St-Hubert", "Resto local"],
    "divertissement":   ["Netflix", "Spotify", "Cineplex", "Steam", "Epic Games"],
    "transport":        ["Opus (STM)", "Presto", "Uber", "Via Rail", "Air Canada"],
    "abonnements":      ["Bell", "Videotron", "Rogers", "Telus", "Amazon Prime"],
    "vetements":        ["Zara", "H&M", "Winners", "Sport Chek", "Reitmans"],
    "sante":            ["Jean Coutu", "Pharmaprix", "Uniprix", "Clinique locale"],
    "education":        ["Université Laval", "UdeM", "McGill", "Concordia", "Registraire"],
    "services_maison":  ["IKEA", "Home Depot", "Rona", "Canadian Tire"],
    "voyage":           ["Air Canada", "Air Transat", "Booking.com", "Expedia", "VIA Rail"],
    "voyage_affaires":  ["Air Canada", "Delta", "Marriott", "Hertz"],
    "fournisseurs":     ["Staples", "Dell", "AWS", "Google Cloud"],
    "services_pro":     ["Comptable local", "Avocat local", "Consultant RH"],
    "equipement":       ["Best Buy", "Bureau en Gros", "CDW", "Dell"],
    "autre":            ["Dépanneur local", "ATM Desjardins", "Virement e-Transfer"],
}

TOUS_LES_COMMERCANTS: list[str] = list(
    set(chain.from_iterable(_COMMERCANTS_PAR_CATEGORIE.values()))
)

# Lookup inverse : commerçant → catégorie
COMMERCANT_TO_CATEGORIE: dict[str, str] = {
    marchand: cat
    for cat, marchands in _COMMERCANTS_PAR_CATEGORIE.items()
    for marchand in marchands
}

TOUTES_LES_VILLES = ["Montreal", "Toronto", "Vancouver", "Quebec", "Ottawa", "Calgary", "Winnipeg", "Halifax"]


# ---------------------------------------------------------------------------
# Génération par compte
# ---------------------------------------------------------------------------

def _generer_transactions_compte(account: pd.Series, weeks: int, rng: np.random.Generator) -> list[dict]:
    """Génère toutes les transactions légitimes pour un compte sur `weeks` semaines."""

    account_id      = account["account_id"]
    archetype       = account["archetype"]
    ville           = account["ville"]
    freq_hebdo      = account["frequence_hebdo"]
    montant_moyen   = account["montant_moyen_transaction"]
    device_principal = account["device_principal"]
    devices         = account["devices"].split("|")
    commercants     = account["commercants_habituels"].split("|")
    horaires        = ast.literal_eval(account["horaires_actifs"])

    end_date   = pd.Timestamp.today().normalize()
    start_date = end_date - pd.Timedelta(weeks=weeks)

    # Sigma lognormale calibré pour avoir ~30% de variance sur le montant
    sigma_log = 0.35

    rows: list[dict] = []

    for semaine in range(weeks):
        semaine_debut = start_date + pd.Timedelta(weeks=semaine)

        # Variabilité réaliste du nombre de transactions par semaine
        n_tx = max(1, int(rng.normal(freq_hebdo, freq_hebdo * 0.25)))

        for _ in range(n_tx):
            # Jour aléatoire dans la semaine
            jour_offset = int(rng.integers(0, 7))
            date_tx = semaine_debut + pd.Timedelta(days=jour_offset)
            est_weekend = date_tx.dayofweek >= 5

            # Heure selon le profil du compte
            heures_dispo = horaires["weekend"] if est_weekend else horaires["jours_semaine"]
            heure = int(rng.choice(heures_dispo))
            minute = int(rng.integers(0, 60))
            seconde = int(rng.integers(0, 60))
            timestamp = date_tx.replace(hour=heure, minute=minute, second=seconde)

            # Commerçant : 80% habituels, 20% nouveau
            if commercants and rng.random() < 0.80:
                commercant = str(rng.choice(commercants))
            else:
                commercant = str(rng.choice(TOUS_LES_COMMERCANTS))
            categorie = COMMERCANT_TO_CATEGORIE.get(commercant, "autre")

            # Montant — lognormale autour du montant moyen du profil
            mu = np.log(max(montant_moyen, 1.0))
            montant = float(round(max(1.0, rng.lognormal(mu, sigma_log)), 2))

            # Device : principal 85% du temps, secondaire sinon
            if len(devices) > 1 and rng.random() < 0.15:
                device = str(rng.choice([d for d in devices if d != device_principal]))
            else:
                device = device_principal

            # Ville : 95% ville du compte, 5% ailleurs (déplacement)
            if rng.random() < 0.05:
                villes_autres = [v for v in TOUTES_LES_VILLES if v != ville]
                ville_tx = str(rng.choice(villes_autres))
            else:
                ville_tx = ville

            rows.append({
                "transaction_id":  str(uuid.uuid4()),
                "account_id":      account_id,
                "archetype":       archetype,
                "timestamp":       timestamp,
                "montant":         montant,
                "commercant":      commercant,
                "categorie":       categorie,
                "device":          device,
                "ville_tx":        ville_tx,
                "est_weekend":     est_weekend,
                "heure":           heure,
                "jour_semaine":    date_tx.dayofweek,  # 0=lundi, 6=dimanche
                "is_fraud":        False,
                "fraud_type":      None,
            })

    return rows


# ---------------------------------------------------------------------------
# Orchestration
# ---------------------------------------------------------------------------

def generate_transactions(
    accounts_path: Path,
    weeks: int,
    seed: int,
) -> pd.DataFrame:

    accounts = pd.read_parquet(accounts_path)
    rng = np.random.default_rng(seed)

    all_rows: list[dict] = []
    total = len(accounts)

    for i, (_, account) in enumerate(accounts.iterrows()):
        if i % 100 == 0:
            print(f"  {i}/{total} comptes traités...", end="\r")
        all_rows.extend(_generer_transactions_compte(account, weeks, rng))

    print(f"  {total}/{total} comptes traités.   ")

    df = pd.DataFrame(all_rows)
    df["timestamp"] = pd.to_datetime(df["timestamp"])
    df = df.sort_values("timestamp").reset_index(drop=True)
    return df


def save(df: pd.DataFrame, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(path, index=False)
    print(f"✓ {len(df):,} transactions sauvegardées → {path}")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Génère les transactions légitimes.")
    parser.add_argument("--weeks",  type=int,  default=13,           help="Nombre de semaines à simuler")
    parser.add_argument("--seed",   type=int,  default=42,           help="Graine aléatoire")
    parser.add_argument("--output", type=Path, default=OUTPUT_PATH,  help="Chemin de sortie (.parquet)")
    args = parser.parse_args()

    print(f"Génération des transactions ({args.weeks} semaines, seed={args.seed})...")
    df = generate_transactions(ACCOUNTS_PATH, args.weeks, args.seed)

    print(f"\n--- Aperçu ---")
    print(f"Transactions totales  : {len(df):,}")
    print(f"Période               : {df['timestamp'].min().date()} → {df['timestamp'].max().date()}")
    print(f"\nTransactions par archétype :")
    print(df["archetype"].value_counts().to_string())
    print(f"\nMontants (CAD) :")
    print(df.groupby("archetype")["montant"].describe()[["mean", "50%", "min", "max"]].round(2).to_string())

    save(df, args.output)


if __name__ == "__main__":
    main()
