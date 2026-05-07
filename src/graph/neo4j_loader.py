"""
Charge les données FraudNet dans Neo4j via inserts Python directs (UNWIND batch).
Prérequis : Neo4j Desktop démarré, .env configuré (voir .env.example).

Usage : python -m src.graph.neo4j_loader
"""
from __future__ import annotations
import os
from pathlib import Path

import pandas as pd
from dotenv import load_dotenv
from neo4j import GraphDatabase

load_dotenv()

NEO4J_URI      = os.environ["NEO4J_URI"]
NEO4J_USER     = os.environ["NEO4J_USER"]
NEO4J_PASSWORD = os.environ["NEO4J_PASSWORD"]

CSV_DIR       = Path("data/generated/neo4j")
ACCOUNTS_PATH = Path("data/generated/accounts.parquet")
TX_PATH       = Path("data/generated/transactions_labeled.parquet")

BATCH_SIZE = 500


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _batch(session, query: str, records: list[dict], label: str) -> None:
    total = len(records)
    done  = 0
    for i in range(0, total, BATCH_SIZE):
        session.run(query, {"batch": records[i : i + BATCH_SIZE]})
        done += min(BATCH_SIZE, total - i)
        print(f"   [{label}] {done:>8,} / {total:,}", end="\r")
    print(f"   [{label}] {total:,} ✓                    ")


# ---------------------------------------------------------------------------
# Contraintes
# ---------------------------------------------------------------------------

CONSTRAINTS = [
    "CREATE CONSTRAINT IF NOT EXISTS FOR (a:Account)     REQUIRE a.accountId     IS UNIQUE",
    "CREATE CONSTRAINT IF NOT EXISTS FOR (m:Merchant)    REQUIRE m.merchantId    IS UNIQUE",
    "CREATE CONSTRAINT IF NOT EXISTS FOR (d:Device)      REQUIRE d.deviceId      IS UNIQUE",
    "CREATE CONSTRAINT IF NOT EXISTS FOR (c:City)        REQUIRE c.cityId        IS UNIQUE",
    "CREATE CONSTRAINT IF NOT EXISTS FOR (t:Transaction) REQUIRE t.transactionId IS UNIQUE",
]


# ---------------------------------------------------------------------------
# Loader principal
# ---------------------------------------------------------------------------

def load(uri: str = NEO4J_URI, user: str = NEO4J_USER, password: str = NEO4J_PASSWORD) -> None:
    print(f"Connexion à Neo4j ({uri})...")
    driver = GraphDatabase.driver(uri, auth=(user, password))

    print("Chargement des données...")
    acc = pd.read_parquet(ACCOUNTS_PATH)
    tx  = pd.read_parquet(TX_PATH)
    tx["timestamp"] = tx["timestamp"].astype(str)
    tx["fraud_type"] = tx["fraud_type"].fillna("")

    with driver.session() as session:

        # 1. Contraintes
        print("\n1. Contraintes...")
        for cql in CONSTRAINTS:
            session.run(cql)
        print("   ✓")

        # 2. Noeuds Account
        print("\n2. Noeuds...")
        _batch(session, """
            UNWIND $batch AS row
            MERGE (a:Account {accountId: row.accountId})
            SET a.archetype     = row.archetype,
                a.prenom        = row.prenom,
                a.nom           = row.nom,
                a.ville         = row.ville,
                a.province      = row.province,
                a.revenuMensuel = row.revenuMensuel,
                a.estVulnerable = row.estVulnerable
        """, acc[["account_id","archetype","prenom","nom","ville","province",
                   "revenu_mensuel","est_vulnerabilite"]].rename(columns={
                "account_id": "accountId", "revenu_mensuel": "revenuMensuel",
                "est_vulnerabilite": "estVulnerable"
        }).to_dict("records"), "Account")

        # Noeuds Merchant
        merchants = tx[["commercant","categorie"]].drop_duplicates("commercant")
        _batch(session, """
            UNWIND $batch AS row
            MERGE (m:Merchant {merchantId: row.merchantId})
            SET m.categorie = row.categorie
        """, merchants.rename(columns={"commercant": "merchantId"}).to_dict("records"), "Merchant")

        # Noeuds Device
        devices = [{"deviceId": d} for d in tx["device"].unique()]
        _batch(session, """
            UNWIND $batch AS row
            MERGE (d:Device {deviceId: row.deviceId})
        """, devices, "Device")

        # Noeuds City
        cities = [{"cityId": c} for c in tx["ville_tx"].unique()]
        _batch(session, """
            UNWIND $batch AS row
            MERGE (c:City {cityId: row.cityId})
        """, cities, "City")

        # 3. Relations
        print("\n3. Relations...")

        # (Account)-[:MADE]->(Transaction)
        _batch(session, """
            UNWIND $batch AS row
            MATCH (a:Account {accountId: row.accountId})
            MERGE (t:Transaction {transactionId: row.transactionId})
            SET t.montant   = row.montant,
                t.timestamp = row.timestamp,
                t.isFraud   = row.isFraud,
                t.fraudType = row.fraudType
            MERGE (a)-[:MADE]->(t)
        """, tx[["account_id","transaction_id","montant","timestamp",
                  "is_fraud","fraud_type"]].rename(columns={
            "account_id": "accountId", "transaction_id": "transactionId",
            "is_fraud": "isFraud", "fraud_type": "fraudType"
        }).to_dict("records"), "MADE")

        # (Transaction)-[:AT]->(Merchant)
        _batch(session, """
            UNWIND $batch AS row
            MATCH (t:Transaction {transactionId: row.transactionId})
            MATCH (m:Merchant    {merchantId:    row.merchantId})
            MERGE (t)-[:AT]->(m)
        """, tx[["transaction_id","commercant"]].rename(columns={
            "transaction_id": "transactionId", "commercant": "merchantId"
        }).to_dict("records"), "AT")

        # (Transaction)-[:USING]->(Device)
        _batch(session, """
            UNWIND $batch AS row
            MATCH (t:Transaction {transactionId: row.transactionId})
            MATCH (d:Device      {deviceId:      row.deviceId})
            MERGE (t)-[:USING]->(d)
        """, tx[["transaction_id","device"]].rename(columns={
            "transaction_id": "transactionId", "device": "deviceId"
        }).to_dict("records"), "USING")

        # (Transaction)-[:IN_CITY]->(City)
        _batch(session, """
            UNWIND $batch AS row
            MATCH (t:Transaction {transactionId: row.transactionId})
            MATCH (c:City        {cityId:        row.cityId})
            MERGE (t)-[:IN_CITY]->(c)
        """, tx[["transaction_id","ville_tx"]].rename(columns={
            "transaction_id": "transactionId", "ville_tx": "cityId"
        }).to_dict("records"), "IN_CITY")

        # (Account)-[:HAS_DEVICE]->(Device)
        acc_dev = acc[["account_id","devices"]].copy()
        acc_dev["devices"] = acc_dev["devices"].str.split("|")
        acc_dev = acc_dev.explode("devices").rename(
            columns={"account_id": "accountId", "devices": "deviceId"}
        )
        _batch(session, """
            UNWIND $batch AS row
            MATCH (a:Account {accountId: row.accountId})
            MATCH (d:Device  {deviceId:  row.deviceId})
            MERGE (a)-[:HAS_DEVICE]->(d)
        """, acc_dev.to_dict("records"), "HAS_DEVICE")

        # 4. Vérification
        print("\n4. Vérification...")
        for label in ["Account", "Merchant", "Device", "City", "Transaction"]:
            n = session.run(f"MATCH (n:{label}) RETURN count(n) AS c").single()["c"]
            print(f"   {label:<15} {n:>8,} noeuds")
        for rel in ["MADE", "AT", "USING", "IN_CITY", "HAS_DEVICE"]:
            n = session.run(f"MATCH ()-[r:{rel}]->() RETURN count(r) AS c").single()["c"]
            print(f"   [:{rel}]{'':>8} {n:>8,} relations")

    driver.close()
    print("\n✓ Chargement terminé → http://localhost:7474")
    print(SAMPLE_QUERIES)


# ---------------------------------------------------------------------------
# Requêtes d'exploration
# ---------------------------------------------------------------------------

SAMPLE_QUERIES = """
╔══════════════════════════════════════════════════════════════════╗
║           REQUÊTES CYPHER — coller dans Neo4j Browser           ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║  // Toutes les transactions frauduleuses                         ║
║  MATCH (a:Account)-[:MADE]->(t:Transaction {isFraud: true})      ║
║  RETURN a, t LIMIT 50                                            ║
║                                                                  ║
║  // Réseau de mules : comptes partageant un device               ║
║  MATCH (a1:Account)-[:HAS_DEVICE]->(d:Device)                    ║
║        <-[:HAS_DEVICE]-(a2:Account)                              ║
║  WHERE a1.accountId <> a2.accountId                              ║
║  RETURN a1, d, a2 LIMIT 100                                      ║
║                                                                  ║
║  // Comptes vulnérables avec fraudes                             ║
║  MATCH (a:Account {estVulnerable: true})-[:MADE]->               ║
║        (t:Transaction {isFraud: true})                           ║
║  RETURN a, t LIMIT 50                                            ║
║                                                                  ║
║  // Commerçants les plus touchés                                 ║
║  MATCH (t:Transaction {isFraud: true})-[:AT]->(m:Merchant)       ║
║  RETURN m.merchantId, count(t) AS nb ORDER BY nb DESC LIMIT 10  ║
║                                                                  ║
║  // Pattern test de carte (micro-transactions en rafale)         ║
║  MATCH (a:Account)-[:MADE]->(t:Transaction                       ║
║        {fraudType: 'test_carte'})                                ║
║  RETURN a, collect(t) LIMIT 30                                   ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
"""


def main() -> None:
    load()


if __name__ == "__main__":
    main()
