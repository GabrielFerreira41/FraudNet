"""
Sprint 3 — Agent Graphe
Score basé sur les features de voisinage dans le graphe de transactions.
Utilise NetworkX pour propager la suspicion sans nécessiter PyTorch Geometric.
Usage : python -m src.detection.graph.agent
"""
from __future__ import annotations
import pickle
from pathlib import Path

import lightgbm as lgb
import networkx as nx
import numpy as np
import pandas as pd

FEATURES_PATH = Path("data/generated/features.parquet")
MODEL_PATH    = Path("models/graph_lgbm.pkl")

# Features graphe disponibles dans features.parquet + features de voisinage calculées ici
GRAPH_FEATURES = [
    "n_comptes_par_device",
    "n_comptes_par_commercant",
    "degre_compte",
    "device_partage_suspect",
    "velocite_1h",
    "velocite_24h",
    "est_rafale",
    "montant_cumul_1h",
]


# ---------------------------------------------------------------------------
# Construction du graphe et propagation de suspicion
# ---------------------------------------------------------------------------

def build_graph(df: pd.DataFrame) -> nx.Graph:
    """
    Construit un graphe bipartite Account ↔ Device.
    Une arête = un compte a utilisé ce device.
    """
    G = nx.Graph()
    for account_id, grp in df.groupby("account_id"):
        for device in grp["device"].unique():
            G.add_edge(f"acc_{account_id}", f"dev_{device}", weight=len(grp))
    return G


def compute_graph_scores(df: pd.DataFrame) -> np.ndarray:
    """
    Pour chaque transaction, calcule un score graphe basé sur :
    - le degré du noeud compte dans le graphe device
    - le nombre de comptes voisins (partageant un device)
    - le clustering coefficient
    Normalise en [0,1].
    """
    G = build_graph(df)

    account_graph_score = {}
    for account_id in df["account_id"].unique():
        node = f"acc_{account_id}"
        if node not in G:
            account_graph_score[account_id] = 0.0
            continue
        degree    = G.degree(node)
        neighbors = list(G.neighbors(node))
        # Nombre de comptes voisins (via devices partagés)
        n_peer_accounts = sum(
            1 for dev in neighbors
            for peer in G.neighbors(dev)
            if peer.startswith("acc_") and peer != node
        )
        account_graph_score[account_id] = float(n_peer_accounts)

    scores = df["account_id"].map(account_graph_score).fillna(0).values.astype(np.float32)
    # Normalise avec sigmoid
    return 1 / (1 + np.exp(-scores / 10))


# ---------------------------------------------------------------------------
# Modèle : LightGBM sur features graphe
# ---------------------------------------------------------------------------

def train(features_path: Path = FEATURES_PATH) -> None:
    df = pd.read_parquet(features_path)
    df["timestamp"] = pd.to_datetime(df["timestamp"])
    df = df.sort_values("timestamp")

    cutoff   = df["timestamp"].max() - pd.Timedelta(weeks=2)
    train_df = df[df["timestamp"] <= cutoff].copy()
    test_df  = df[df["timestamp"] >  cutoff].copy()

    # Ajoute le score de propagation graphe comme feature supplémentaire
    print("Calcul des scores graphe (train)...")
    train_df["graph_propagation"] = compute_graph_scores(train_df)
    print("Calcul des scores graphe (test)...")
    test_df["graph_propagation"]  = compute_graph_scores(test_df)

    all_features = GRAPH_FEATURES + ["graph_propagation"]

    X_train = train_df[all_features]
    y_train = train_df["is_fraud"].astype(int)
    X_test  = test_df[all_features]
    y_test  = test_df["is_fraud"].astype(int)

    n_neg = (y_train == 0).sum()
    n_pos = (y_train == 1).sum()
    print(f"Train : {len(X_train):,} | fraudes : {n_pos}")

    params = {
        "objective":        "binary",
        "metric":           "auc",
        "scale_pos_weight": n_neg / max(n_pos, 1),
        "num_leaves":       15,
        "learning_rate":    0.05,
        "verbose":          -1,
        "seed":             42,
    }

    dtrain = lgb.Dataset(X_train, label=y_train)
    dval   = lgb.Dataset(X_test,  label=y_test, reference=dtrain)
    callbacks = [lgb.early_stopping(30, verbose=False), lgb.log_evaluation(50)]

    model = lgb.train(params, dtrain, num_boost_round=300,
                      valid_sets=[dval], callbacks=callbacks)

    MODEL_PATH.parent.mkdir(exist_ok=True)
    with open(MODEL_PATH, "wb") as f:
        pickle.dump({"model": model, "features": all_features}, f)

    y_scores = model.predict(X_test)
    from sklearn.metrics import roc_auc_score
    auc = roc_auc_score(y_test, y_scores)
    print(f"✓ Agent Graphe — AUC-ROC test : {auc:.4f}")
    print(f"✓ Modèle sauvegardé → {MODEL_PATH}")


def score(df: pd.DataFrame) -> np.ndarray:
    with open(MODEL_PATH, "rb") as f:
        data = pickle.load(f)
    model, features = data["model"], data["features"]
    df = df.copy()
    df["graph_propagation"] = compute_graph_scores(df)
    return model.predict(df[features])


def main() -> None:
    print("Sprint 3 — Entraînement agent graphe...")
    train()


if __name__ == "__main__":
    main()
