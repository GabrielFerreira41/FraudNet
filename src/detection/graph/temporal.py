"""
Agent Graphe G3 — Vélocité Temporelle (GCN pondéré)
=====================================================
Signal : des fraudeurs compromettent plusieurs comptes et les utilisent
en rafale dans les mêmes marchands, dans une fenêtre de temps courte.

Graphe Account-Account (cooccurrence temporelle) :
    Nœuds  : comptes
    Arêtes : account_i ↔ account_j  si les deux ont transacté chez le
             même marchand dans la même fenêtre de 1 h
    Poids  : w = exp(−Δt / τ) avec τ = 30 min  (arêtes récentes → plus fort)

Modèle : GCN 2 couches avec propagation pondérée par les poids d'arêtes
    in_feats → 64 → 32 → 1 (sigmoid)

Fort sur : test_carte (rafale multi-comptes), structuration
"""
from __future__ import annotations
from pathlib import Path

import numpy as np
import pandas as pd
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch_geometric.nn import GCNConv
from torch_geometric.utils import add_self_loops, degree
from sklearn.metrics import roc_auc_score

from src.detection.graph.graph_utils import (
    build_account_features, get_account_labels,
    temporal_split, fit_scaler, account_index,
    N_ACCOUNT_FEATS,
)

FEATURES_PATH = Path("data/generated/features.parquet")
MODEL_PATH    = Path("models/graph_g3_temporal.pt")

WINDOW_HOURS  = 1       # fenêtre de cooccurrence
TAU_MINUTES   = 30.0    # constante de décroissance exponentielle


# ── Graphe temporel ───────────────────────────────────────────────────────────

def build_temporal_graph(
    df: pd.DataFrame,
    accounts: list,
) -> tuple[torch.Tensor, torch.Tensor]:
    """
    Construit le graphe de cooccurrence temporelle Account-Account.
    Deux comptes sont liés si ils ont transacté chez le même marchand
    dans la même fenêtre de 1h. Le poids de l'arête est exp(-Δt / τ).

    Retourne :
      edge_index  [2, E]
      edge_weight [E]    (float32, décroissance exponentielle)
    """
    idx = account_index(accounts)
    acc_set = set(accounts)

    df = df.copy()
    df["timestamp"] = pd.to_datetime(df["timestamp"])
    df["time_bucket"] = df["timestamp"].dt.floor(f"{WINDOW_HOURS}h")

    edges: dict[tuple[int, int], float] = {}

    for (merchant, bucket), grp in df.groupby(["commercant", "time_bucket"]):
        accs = [a for a in grp["account_id"].unique() if a in idx]
        if len(accs) < 2:
            continue

        # Timestamp moyen par compte dans ce bucket
        ts_map = grp.groupby("account_id")["timestamp"].min()

        for i in range(len(accs)):
            for j in range(i + 1, len(accs)):
                ai, aj = idx[accs[i]], idx[accs[j]]
                ti = ts_map.get(accs[i], bucket)
                tj = ts_map.get(accs[j], bucket)
                delta_min = abs((ti - tj).total_seconds()) / 60.0
                w = float(np.exp(-delta_min / TAU_MINUTES))

                # Garde le poids maximal si l'arête existe déjà
                key = (min(ai, aj), max(ai, aj))
                edges[key] = max(edges.get(key, 0.0), w)

    if not edges:
        n = len(accounts)
        loops = torch.arange(n).unsqueeze(0).repeat(2, 1)
        return loops, torch.ones(n)

    pairs    = list(edges.keys())
    weights  = [edges[p] for p in pairs]

    src = [p[0] for p in pairs] + [p[1] for p in pairs]
    dst = [p[1] for p in pairs] + [p[0] for p in pairs]
    w   = weights + weights

    edge_index  = torch.tensor([src, dst], dtype=torch.long)
    edge_weight = torch.tensor(w, dtype=torch.float32)
    return edge_index, edge_weight


# ── Modèle GCN pondéré ────────────────────────────────────────────────────────

class TemporalGCNFraud(nn.Module):
    """
    GCN 2 couches avec poids d'arêtes (edge_weight).

    La propagation pondérée donne plus d'importance aux co-occurrences
    récentes : un compte entouré de comptes actifs dans la même fenêtre
    horaire chez le même marchand hérite de leur suspicion.
    """
    def __init__(self, in_feats: int, hidden: int = 64, out: int = 32):
        super().__init__()
        self.conv1 = GCNConv(in_feats, hidden)
        self.conv2 = GCNConv(hidden, out)
        self.drop  = nn.Dropout(0.3)
        self.head  = nn.Sequential(
            nn.Linear(out + in_feats, 32),
            nn.ReLU(),
            nn.Dropout(0.3),
            nn.Linear(32, 1),
        )

    def forward(
        self,
        x: torch.Tensor,
        edge_index: torch.Tensor,
        edge_weight: torch.Tensor,
    ) -> torch.Tensor:
        h = F.relu(self.conv1(x, edge_index, edge_weight))
        h = self.drop(h)
        h = F.relu(self.conv2(h, edge_index, edge_weight))
        h = torch.cat([h, x], dim=1)   # skip connection
        return torch.sigmoid(self.head(h)).squeeze(-1)


# ── Entraînement ──────────────────────────────────────────────────────────────

def train(features_path: Path = FEATURES_PATH, model_path: Path = MODEL_PATH) -> None:
    print("G3 · Temporal Velocity (GCN pondéré)")
    df = pd.read_parquet(features_path)
    train_df, test_df = temporal_split(df)

    x_train, accounts_train = build_account_features(train_df)
    x_test,  accounts_test  = build_account_features(test_df)
    y_train = get_account_labels(train_df, accounts_train)
    y_test  = get_account_labels(test_df,  accounts_test)

    x_train, x_test, _ = fit_scaler(x_train, x_test)

    print("  Construction graphe temporel train…")
    edge_train, ew_train = build_temporal_graph(train_df, accounts_train)
    print("  Construction graphe temporel test…")
    edge_test,  ew_test  = build_temporal_graph(test_df,  accounts_test)

    X_tr = torch.tensor(x_train, dtype=torch.float32)
    X_te = torch.tensor(x_test,  dtype=torch.float32)
    Y_tr = torch.tensor(y_train, dtype=torch.float32)
    Y_te = torch.tensor(y_test,  dtype=torch.float32)

    n_pos = int(Y_tr.sum())
    n_neg = len(Y_tr) - n_pos
    pos_weight = torch.tensor([n_neg / max(n_pos, 1)], dtype=torch.float32)

    model     = TemporalGCNFraud(in_feats=X_tr.shape[1])
    optimizer = torch.optim.Adam(model.parameters(), lr=5e-4, weight_decay=1e-4)
    criterion = nn.BCELoss(reduction="none")

    print(f"  Train : {len(accounts_train)} comptes, {int(Y_tr.sum())} frauduleux")
    print(f"  Arêtes temporelles train : {edge_train.shape[1]}")

    best_auc, best_state, patience, patience_max = 0.0, None, 0, 30
    for epoch in range(1, 301):
        model.train()
        optimizer.zero_grad()
        preds   = model(X_tr, edge_train, ew_train)
        weights = torch.where(Y_tr == 1, pos_weight.expand_as(Y_tr), torch.ones_like(Y_tr))
        loss    = (criterion(preds, Y_tr) * weights).mean()
        loss.backward()
        optimizer.step()

        if epoch % 10 == 0:
            model.eval()
            with torch.no_grad():
                probs = model(X_te, edge_test, ew_test).numpy()
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

    if best_state:
        model.load_state_dict(best_state)

    model_path.parent.mkdir(exist_ok=True)
    torch.save({
        "state":    model.state_dict(),
        "in_feats": X_tr.shape[1],
    }, model_path)
    print(f"  ✓ AUC-ROC test : {best_auc:.4f}  →  {model_path}")


# ── Inférence ──────────────────────────────────────────────────────────────────

def score(df: pd.DataFrame, model_path: Path = MODEL_PATH) -> np.ndarray:
    ckpt  = torch.load(model_path, map_location="cpu", weights_only=True)
    model = TemporalGCNFraud(in_feats=ckpt["in_feats"])
    model.load_state_dict(ckpt["state"])
    model.eval()

    x_raw, accounts = build_account_features(df)
    from sklearn.preprocessing import StandardScaler
    x_norm = StandardScaler().fit_transform(x_raw)

    X = torch.tensor(x_norm, dtype=torch.float32)
    edge_index, edge_weight = build_temporal_graph(df, accounts)
    idx = account_index(accounts)

    with torch.no_grad():
        account_scores = model(X, edge_index, edge_weight).numpy()

    account_score_map = {a: float(account_scores[i]) for i, a in enumerate(accounts)}
    return df["account_id"].map(account_score_map).fillna(0.0).values


def main() -> None:
    train()


if __name__ == "__main__":
    main()
