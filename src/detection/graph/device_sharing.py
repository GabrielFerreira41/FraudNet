"""
Agent Graphe G1 — Réseau de partage de devices (GraphSAGE)
===========================================================
Signal : deux comptes qui partagent un même device sont potentiellement
liés (réseau de mules, comptes synthétiques, usurpation d'identité).

Graphe :
    Nœuds  : 1 compte = 1 nœud, features = moyennes transactionnelles
    Arêtes : account_i ↔ account_j  si ∃ device utilisé par les deux

Modèle : GraphSAGE 2 couches (mean aggregation)
    in_feats → 64 → 32 → 1 (sigmoid)

Fort sur : structuration, reseau_mules, prise_de_compte
"""
from __future__ import annotations
import pickle
from pathlib import Path

import numpy as np
import pandas as pd
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch_geometric.nn import SAGEConv
from torch_geometric.data import Data
from sklearn.metrics import roc_auc_score

from src.detection.graph.graph_utils import (
    build_account_features, get_account_labels,
    temporal_split, fit_scaler, account_index,
    N_ACCOUNT_FEATS,
)

FEATURES_PATH = Path("data/generated/features.parquet")
MODEL_PATH    = Path("models/graph_g1_device.pt")


# ── Graphe ───────────────────────────────────────────────────────────────────

def build_graph(df: pd.DataFrame, accounts: list) -> torch.Tensor:
    """
    Construit edge_index [2, E] : account_i ↔ account_j via device partagé.
    Un device partagé entre k comptes crée k*(k-1) arêtes dirigées (toutes directions).
    """
    idx = account_index(accounts)
    edges: set[tuple[int, int]] = set()

    for _, grp in df.groupby("device"):
        accs = [a for a in grp["account_id"].unique() if a in idx]
        for i in range(len(accs)):
            for j in range(i + 1, len(accs)):
                ai, aj = idx[accs[i]], idx[accs[j]]
                edges.add((ai, aj))
                edges.add((aj, ai))

    if not edges:
        # Graphe vide : pas d'arêtes → auto-boucles pour éviter les nœuds isolés
        n = len(accounts)
        loops = torch.arange(n).unsqueeze(0).repeat(2, 1)
        return loops

    src, dst = zip(*edges)
    return torch.tensor([list(src), list(dst)], dtype=torch.long)


# ── Modèle ───────────────────────────────────────────────────────────────────

class GraphSAGEFraud(nn.Module):
    """
    2 couches SAGEConv (mean) + tête de classification.

    L'idée : chaque compte agrège les features de ses voisins (comptes
    partageant un device). Si ses voisins ont des patterns anormaux,
    ça contamine le score du compte courant → propagation de suspicion.
    """
    def __init__(self, in_feats: int, hidden: int = 64, out: int = 32):
        super().__init__()
        self.conv1 = SAGEConv(in_feats, hidden, aggr="mean")
        self.conv2 = SAGEConv(hidden, out, aggr="mean")
        self.head  = nn.Linear(out, 1)
        self.drop  = nn.Dropout(0.3)

    def forward(self, x: torch.Tensor, edge_index: torch.Tensor) -> torch.Tensor:
        h = F.relu(self.conv1(x, edge_index))
        h = self.drop(h)
        h = F.relu(self.conv2(h, edge_index))
        return torch.sigmoid(self.head(h)).squeeze(-1)


# ── Entraînement ─────────────────────────────────────────────────────────────

def train(features_path: Path = FEATURES_PATH, model_path: Path = MODEL_PATH) -> None:
    print("G1 · Device Sharing (GraphSAGE)")
    df = pd.read_parquet(features_path)
    train_df, test_df = temporal_split(df)

    # Features et labels par compte
    x_train, accounts_train = build_account_features(train_df)
    x_test,  accounts_test  = build_account_features(test_df)
    y_train = get_account_labels(train_df, accounts_train)
    y_test  = get_account_labels(test_df,  accounts_test)

    # Normalisation
    x_train, x_test, _ = fit_scaler(x_train, x_test)

    # Graphes
    edge_train = build_graph(train_df, accounts_train)
    edge_test  = build_graph(test_df,  accounts_test)

    X_tr = torch.tensor(x_train, dtype=torch.float32)
    X_te = torch.tensor(x_test,  dtype=torch.float32)
    Y_tr = torch.tensor(y_train, dtype=torch.float32)
    Y_te = torch.tensor(y_test,  dtype=torch.float32)

    n_pos = int(Y_tr.sum())
    n_neg = len(Y_tr) - n_pos
    pos_weight = torch.tensor([n_neg / max(n_pos, 1)], dtype=torch.float32)

    model     = GraphSAGEFraud(in_feats=X_tr.shape[1])
    optimizer = torch.optim.Adam(model.parameters(), lr=1e-3, weight_decay=1e-4)
    criterion = nn.BCELoss(reduction="none")

    print(f"  Train : {len(accounts_train)} comptes, {int(Y_tr.sum())} frauduleux")

    best_auc, best_state, patience, patience_max = 0.0, None, 0, 30
    for epoch in range(1, 301):
        model.train()
        optimizer.zero_grad()
        preds = model(X_tr, edge_train)
        # Pondération des positifs (très rares)
        weights = torch.where(Y_tr == 1, pos_weight.expand_as(Y_tr), torch.ones_like(Y_tr))
        loss = (criterion(preds, Y_tr) * weights).mean()
        loss.backward()
        optimizer.step()

        if epoch % 10 == 0:
            model.eval()
            with torch.no_grad():
                probs = model(X_te, edge_test).numpy()
            try:
                auc = roc_auc_score(Y_te.numpy(), probs)
            except Exception:
                auc = 0.0
            if auc > best_auc:
                best_auc, best_state, patience = auc, model.state_dict(), 0
            else:
                patience += 1
            if patience >= patience_max:
                print(f"  Early stopping epoch {epoch}")
                break

    if best_state is not None:
        model.load_state_dict(best_state)

    model_path.parent.mkdir(exist_ok=True)
    torch.save({"state": model.state_dict(), "in_feats": X_tr.shape[1]}, model_path)
    print(f"  ✓ AUC-ROC test : {best_auc:.4f}  →  {model_path}")


# ── Inférence ─────────────────────────────────────────────────────────────────

def score(df: pd.DataFrame, model_path: Path = MODEL_PATH) -> np.ndarray:
    """
    Retourne un score [0,1] par transaction (= score de son compte).
    """
    ckpt = torch.load(model_path, map_location="cpu", weights_only=True)
    model = GraphSAGEFraud(in_feats=ckpt["in_feats"])
    model.load_state_dict(ckpt["state"])
    model.eval()

    x_raw, accounts = build_account_features(df)
    from sklearn.preprocessing import StandardScaler
    scaler = StandardScaler().fit(x_raw)  # ré-ajuste sur les données courantes
    x_norm = scaler.transform(x_raw)

    X = torch.tensor(x_norm, dtype=torch.float32)
    edge_index = build_graph(df, accounts)
    idx = account_index(accounts)

    with torch.no_grad():
        account_scores = model(X, edge_index).numpy()

    # Map transaction → score de son compte
    account_score_map = {a: float(account_scores[i]) for i, a in enumerate(accounts)}
    return df["account_id"].map(account_score_map).fillna(0.0).values


def main() -> None:
    train()


if __name__ == "__main__":
    main()
