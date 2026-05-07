"""
Génère des profils clients synthétiques pour le simulateur FraudNet.
Usage : python -m src.simulator.profile_generator --n 1000 --seed 42
"""

from __future__ import annotations

import argparse
import uuid
from dataclasses import dataclass, field, asdict
from pathlib import Path

import numpy as np
import pandas as pd
import yaml
from faker import Faker

fake = Faker("fr_CA")
CONFIG_PATH = Path(__file__).parents[2] / "data" / "configs" / "profiles.yaml"
OUTPUT_PATH = Path(__file__).parents[2] / "data" / "generated" / "accounts.parquet"


# ---------------------------------------------------------------------------
# Modèle de données
# ---------------------------------------------------------------------------

@dataclass
class Account:
    account_id: str
    archetype: str
    prenom: str
    nom: str
    email: str
    telephone: str
    date_naissance: str
    ville: str
    province: str
    code_postal: str
    revenu_mensuel: float
    montant_moyen_transaction: float
    frequence_hebdo: int
    devices: list[str]          # appareils enregistrés (1 à 3)
    device_principal: str
    categories_depenses: dict[str, float]
    horaires_actifs: dict[str, list[int]]
    commercants_habituels: list[str]
    date_ouverture: str
    solde_initial: float
    est_vulnerabilite: bool     # profil légèrement atypique (5%) → plus facile à frauder


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

PROVINCES = {
    "Montreal": "QC", "Quebec": "QC",
    "Toronto": "ON", "Ottawa": "ON",
    "Vancouver": "BC",
    "Calgary": "AB",
    "autre": "ON",
}

COMMERCANTS_PAR_CATEGORIE: dict[str, list[str]] = {
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
    "voyage_affaires":  ["Air Canada", "Delta", "Marriott", "Hertz", "Expedia for Business"],
    "fournisseurs":     ["Staples", "Dell", "AWS", "Google Cloud", "Fournisseur local"],
    "services_pro":     ["Comptable local", "Avocat local", "Consultant RH"],
    "equipement":       ["Best Buy", "Bureau en Gros", "CDW", "Dell"],
    "autre":            ["Dépanneur local", "ATM Desjardins", "Virement e-Transfer"],
}


def _sample_ville(villes_prob: dict[str, float], rng: np.random.Generator) -> str:
    villes = list(villes_prob.keys())
    probs = list(villes_prob.values())
    return rng.choice(villes, p=probs)


def _sample_devices(device_probs: dict[str, float], rng: np.random.Generator) -> tuple[list[str], str]:
    types = list(device_probs.keys())
    probs = list(device_probs.values())
    principal = rng.choice(types, p=probs)
    # 40% de chance d'avoir un second appareil
    enregistres = [principal]
    autres = [d for d in types if d != principal]
    if autres and rng.random() < 0.40:
        second = rng.choice(autres)
        enregistres.append(second)
    return enregistres, principal


def _pick_commercants(categories: dict[str, float], rng: np.random.Generator, n: int = 8) -> list[str]:
    """Sélectionne ~n commerçants pondérés par les catégories de dépenses du profil."""
    pool: list[tuple[str, float]] = []
    for cat, weight in categories.items():
        for marchand in COMMERCANTS_PAR_CATEGORIE.get(cat, []):
            pool.append((marchand, weight))
    if not pool:
        return []
    marchands, poids = zip(*pool)
    poids_arr = np.array(poids, dtype=float)
    poids_arr /= poids_arr.sum()
    choisis = rng.choice(list(marchands), size=min(n, len(marchands)), replace=False, p=poids_arr)
    return list(choisis)


def _sample_revenu(cfg: dict, rng: np.random.Generator) -> float:
    if cfg["distribution"] == "lognormal":
        mu = np.log(cfg["mean"])
        sigma = cfg["std"] / cfg["mean"]
        return float(np.clip(rng.lognormal(mu, sigma), cfg["mean"] * 0.3, cfg["mean"] * 3))
    mean, std = cfg["mean"], cfg["std"]
    return float(np.clip(rng.normal(mean, std), mean * 0.2, mean * 3))


def _sample_montant(cfg: dict, rng: np.random.Generator) -> float:
    val = rng.normal(cfg["mean"], cfg["std"])
    return float(max(5.0, round(val, 2)))


# ---------------------------------------------------------------------------
# Générateur principal
# ---------------------------------------------------------------------------

def generate_accounts(n: int, config_path: Path, seed: int = 42) -> list[Account]:
    rng = np.random.default_rng(seed)
    Faker.seed(seed)

    with open(config_path) as f:
        config = yaml.safe_load(f)

    archetypes = config["archetypes"]
    noms = list(archetypes.keys())
    poids = [archetypes[a]["weight"] for a in noms]

    # Distribution du nombre de comptes par archétype
    counts = rng.multinomial(n, poids)

    accounts: list[Account] = []

    for archetype_name, count in zip(noms, counts):
        cfg = archetypes[archetype_name]

        for _ in range(count):
            ville = _sample_ville(cfg["villes_prob"], rng)
            province = PROVINCES.get(ville, "ON")
            devices, device_principal = _sample_devices(cfg["devices"], rng)
            revenu = _sample_revenu(cfg["revenus"], rng)
            montant = _sample_montant(cfg["montant_moyen"], rng)
            freq = int(rng.integers(cfg["frequence_hebdo"]["min"], cfg["frequence_hebdo"]["max"] + 1))
            commercants = _pick_commercants(cfg["categories_depenses"], rng)

            # Date d'ouverture : entre 1 et 10 ans en arrière
            jours_arriere = int(rng.integers(30, 3650))
            date_ouverture = pd.Timestamp.today().normalize() - pd.Timedelta(days=jours_arriere)

            # Solde initial cohérent avec le revenu (1 à 4 mois)
            solde = float(round(revenu * rng.uniform(1.0, 4.0), 2))

            # 5% de profils légèrement vulnérables (utilisés pour injection de fraude ciblée)
            vulnerabilite = bool(rng.random() < 0.05)

            accounts.append(Account(
                account_id=str(uuid.uuid4()),
                archetype=archetype_name,
                prenom=fake.first_name(),
                nom=fake.last_name(),
                email=fake.email(),
                telephone=fake.phone_number(),
                date_naissance=str(fake.date_of_birth(minimum_age=18, maximum_age=80)),
                ville=ville,
                province=province,
                code_postal=fake.postcode(),
                revenu_mensuel=round(revenu, 2),
                montant_moyen_transaction=round(montant, 2),
                frequence_hebdo=freq,
                devices=devices,
                device_principal=device_principal,
                categories_depenses=cfg["categories_depenses"],
                horaires_actifs=cfg["horaires_actifs"],
                commercants_habituels=commercants,
                date_ouverture=str(date_ouverture.date()),
                solde_initial=solde,
                est_vulnerabilite=vulnerabilite,
            ))

    rng.shuffle(accounts)
    return accounts


# ---------------------------------------------------------------------------
# Sérialisation
# ---------------------------------------------------------------------------

def accounts_to_dataframe(accounts: list[Account]) -> pd.DataFrame:
    rows = []
    for acc in accounts:
        row = asdict(acc)
        # Aplatir les listes/dicts en JSON string pour Parquet
        row["devices"] = "|".join(row["devices"])
        row["commercants_habituels"] = "|".join(row["commercants_habituels"])
        row["categories_depenses"] = str(row["categories_depenses"])
        row["horaires_actifs"] = str(row["horaires_actifs"])
        rows.append(row)
    return pd.DataFrame(rows)


def save(df: pd.DataFrame, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(path, index=False)
    print(f"✓ {len(df)} comptes sauvegardés → {path}")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Génère des comptes clients synthétiques.")
    parser.add_argument("--n", type=int, default=1000, help="Nombre de comptes à générer")
    parser.add_argument("--seed", type=int, default=42, help="Graine aléatoire pour reproducibilité")
    parser.add_argument("--output", type=Path, default=OUTPUT_PATH, help="Chemin de sortie (.parquet)")
    args = parser.parse_args()

    print(f"Génération de {args.n} comptes (seed={args.seed})...")
    accounts = generate_accounts(args.n, CONFIG_PATH, seed=args.seed)
    df = accounts_to_dataframe(accounts)

    print("\n--- Répartition par archétype ---")
    print(df["archetype"].value_counts().to_string())
    print("\n--- Aperçu des revenus mensuels (CAD) ---")
    print(df.groupby("archetype")["revenu_mensuel"].describe()[["mean", "min", "max"]].round(0).to_string())

    save(df, args.output)


if __name__ == "__main__":
    main()
