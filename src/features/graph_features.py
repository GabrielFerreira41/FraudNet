"""
Features de graphe : relations entre comptes, devices partagés, centralité.
Prépare aussi les exports pour Neo4j.
"""
from __future__ import annotations
from pathlib import Path
import pandas as pd
import numpy as np

OUTPUT_DIR = Path(__file__).parents[2] / "data" / "generated"


def add_graph_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Ajoute des features graphe calculées en pandas (sans Neo4j).
    Neo4j servira à la visualisation et à l'exploration interactive.
    """
    # Nombre de comptes distincts ayant utilisé le même device
    device_sharing = (
        df.groupby("device")["account_id"]
        .nunique()
        .rename("n_comptes_par_device")
    )
    df = df.merge(device_sharing, on="device", how="left")

    # Nombre de comptes distincts ayant eu des transactions chez le même commerçant
    merchant_sharing = (
        df.groupby("commercant")["account_id"]
        .nunique()
        .rename("n_comptes_par_commercant")
    )
    df = df.merge(merchant_sharing, on="commercant", how="left")

    # Degré du compte : nombre de commerçants distincts contactés
    compte_degre = (
        df.groupby("account_id")["commercant"]
        .nunique()
        .rename("degre_compte")
    )
    df = df.merge(compte_degre, on="account_id", how="left")

    # Flag : device partagé par plus de 3 comptes (signal réseau de mules)
    df["device_partage_suspect"] = (df["n_comptes_par_device"] > 3).astype(int)

    return df


# ---------------------------------------------------------------------------
# Export Neo4j — génère des CSVs structurés pour l'import LOAD CSV
# ---------------------------------------------------------------------------

def export_for_neo4j(df: pd.DataFrame, accounts: pd.DataFrame, output_dir: Path = OUTPUT_DIR) -> None:
    """
    Génère 5 fichiers CSV prêts pour Neo4j LOAD CSV :
      - nodes_accounts.csv
      - nodes_merchants.csv
      - nodes_devices.csv
      - nodes_cities.csv
      - rels_made.csv         (Account)-[:MADE]->(Transaction)
      - rels_at.csv           (Transaction)-[:AT]->(Merchant)
      - rels_using.csv        (Transaction)-[:USING]->(Device)
      - rels_in_city.csv      (Transaction)-[:IN_CITY]->(City)
      - rels_account_device.csv (Account)-[:HAS_DEVICE]->(Device)
    """
    neo4j_dir = output_dir / "neo4j"
    neo4j_dir.mkdir(exist_ok=True)

    # --- Noeuds comptes ---
    nodes_accounts = accounts[[
        "account_id", "archetype", "prenom", "nom",
        "ville", "province", "revenu_mensuel", "est_vulnerabilite"
    ]].copy()
    nodes_accounts.columns = ["accountId", "archetype", "prenom", "nom",
                               "ville", "province", "revenuMensuel", "estVulnerable"]
    nodes_accounts.to_csv(neo4j_dir / "nodes_accounts.csv", index=False)

    # --- Noeuds commerçants ---
    merchants = df[["commercant", "categorie"]].drop_duplicates("commercant")
    merchants.columns = ["merchantId", "categorie"]
    merchants.to_csv(neo4j_dir / "nodes_merchants.csv", index=False)

    # --- Noeuds devices ---
    devices = pd.DataFrame({"deviceId": df["device"].unique()})
    devices.to_csv(neo4j_dir / "nodes_devices.csv", index=False)

    # --- Noeuds villes ---
    cities = pd.DataFrame({"cityId": df["ville_tx"].unique()})
    cities.to_csv(neo4j_dir / "nodes_cities.csv", index=False)

    # --- Relations (Account)-[:MADE]->(Transaction) ---
    rels_made = df[["account_id", "transaction_id", "montant", "timestamp",
                    "is_fraud", "fraud_type"]].copy()
    rels_made.columns = ["accountId", "transactionId", "montant", "timestamp",
                         "isFraud", "fraudType"]
    rels_made["timestamp"] = rels_made["timestamp"].astype(str)
    rels_made.to_csv(neo4j_dir / "rels_made.csv", index=False)

    # --- Relations (Transaction)-[:AT]->(Merchant) ---
    rels_at = df[["transaction_id", "commercant"]].copy()
    rels_at.columns = ["transactionId", "merchantId"]
    rels_at.to_csv(neo4j_dir / "rels_at.csv", index=False)

    # --- Relations (Transaction)-[:USING]->(Device) ---
    rels_using = df[["transaction_id", "device"]].copy()
    rels_using.columns = ["transactionId", "deviceId"]
    rels_using.to_csv(neo4j_dir / "rels_using.csv", index=False)

    # --- Relations (Transaction)-[:IN_CITY]->(City) ---
    rels_city = df[["transaction_id", "ville_tx"]].copy()
    rels_city.columns = ["transactionId", "cityId"]
    rels_city.to_csv(neo4j_dir / "rels_in_city.csv", index=False)

    # --- Relations (Account)-[:HAS_DEVICE]->(Device) ---
    acc_devices = accounts[["account_id", "devices"]].copy()
    acc_devices["devices"] = acc_devices["devices"].str.split("|")
    acc_devices = acc_devices.explode("devices")
    acc_devices.columns = ["accountId", "deviceId"]
    acc_devices.to_csv(neo4j_dir / "rels_account_device.csv", index=False)

    print(f"✓ Export Neo4j → {neo4j_dir}/")
    for f in sorted(neo4j_dir.iterdir()):
        lines = sum(1 for _ in open(f)) - 1
        print(f"   {f.name:<35} {lines:>8,} lignes")
