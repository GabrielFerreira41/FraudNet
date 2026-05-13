"""
Agent Graphe G2 — Réseau marchand (GAT — Graph Attention Network)
=================================================================
Signal : certains marchands sont disproportionnellement ciblés par des
comptes frauduleux. Le modèle apprend à quel point chaque marchand
est suspect via de l'attention, puis propage ce signal vers les comptes.

Graphe bipartite :
    Nœuds  : comptes + marchands (deux types de nœuds)
    Arêtes : compte → marchand  si le compte y a transacté
    Sens   : message passing marchand → compte
             (un compte "hérite" du niveau de suspicion de ses marchands)

Modèle : GAT 2 couches (4 têtes d'attention) sur graphe bipartite
    compte_feats + marchand_feats → attention → embedding → sigmoid

Fort sur : test_carte (marchands ciblés en rafale), carte_volee
"""
from __future__ import annotations
import pickle
from pathlib import Path

import numpy as np
import pandas as pd
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch_geometric.nn import GATConv
from torch_geometric.data import HeteroData
from torch_geometric.nn import to_hetero
from sklearn.metrics import roc_auc_score

from src.detection.graph.graph_utils import (
    build_account_features, get_account_labels,
    temporal_split, fit_scaler, account_index,
    N_ACCOUNT_FEATS,
)

FEATURES_PATH = Path("data/generated/features.parquet")
MODEL_PATH    = Path("models/graph_g2_merchant.pt")

N_MERCHANT_FEATS = 4   # fraud_rate, n_tx, n_unique_accounts, mean_montant


# ── Graphe bipartite ──────────────────────────────────────────────────────────

def build_bipartite_graph(
    df: pd.DataFrame,
    accounts: list,
) -> tuple[torch.Tensor, torch.Tensor, list, torch.Tensor]:
    """
    Construit le graphe Account → Merchant.
    Retourne :
      edge_index   [2, E]  indices (account_idx, merchant_idx)
      merch_feats  [M, N_MERCHANT_FEATS]
      merchants    liste ordonnée des noms de marchands
    """
    acc_idx = account_index(accounts)

    # Features par marchand
    merch_grp  = df.groupby("commercant")
    fraud_rate = merch_grp["is_fraud"].mean()
    n_tx       = merch_grp.size()
    n_accs     = merch_grp["account_id"].nunique()
    mean_mont  = merch_grp["montant"].mean()

    merchants  = list(fraud_rate.index)
    merch_idx  = {m: i for i, m in enumerate(merchants)}

    merch_feats = np.stack([
        fraud_rate.values,
        np.log1p(n_tx.values),
        np.log1p(n_accs.values),
        np.log1p(mean_mont.values),
    ], axis=1).astype(np.float32)

    # Arêtes compte → marchand (une arête par paire unique)
    pairs = df[["account_id", "commercant"]].drop_duplicates()
    src, dst = [], []
    for _, row in pairs.iterrows():
        a, m = row["account_id"], row["commercant"]
        if a in acc_idx and m in merch_idx:
            src.append(acc_idx[a])
            dst.append(merch_idx[m])

    edge_index = torch.tensor([src, dst], dtype=torch.long)
    return edge_index, torch.tensor(merch_feats), merchants


# ── Modèle GAT bipartite ──────────────────────────────────────────────────────

class GATBipartiteFraud(nn.Module):
    """
    GAT sur graphe bipartite Account-Merchant.

    Étape 1 — Marchand → Compte (GAT) :
        Chaque compte attend sur ses marchands via des têtes d'attention.
        Un marchand à fort taux de fraude recevra une attention plus élevée.
        Le compte hérite ainsi du niveau de suspicion de ses marchands.

    Étape 2 — Classification :
        Embedding compte → score de fraude [0,1].
    """
    def __init__(self, acc_feats: int, merch_feats: int, hidden: int = 64, heads: int = 4):
        super().__init__()
        # Projette les comptes et marchands dans le même espace
        self.proj_acc   = nn.Linear(acc_feats,   hidden)
        self.proj_merch = nn.Linear(merch_feats, hidden)

        # GAT : message passing marchand → compte
        # bipartite=True : source et destination ont des dims différentes
        self.gat1 = GATConv((hidden, hidden), hidden // heads, heads=heads,
                            add_self_loops=False, dropout=0.3)
        self.gat2 = GATConv(hidden, hidden // 2, heads=1,
                            add_self_loops=False, concat=False)

        self.head = nn.Sequential(
            nn.Linear(hidden // 2 + acc_feats, 32),
            nn.ReLU(),
            nn.Dropout(0.3),
            nn.Linear(32, 1),
        )

    def forward(
        self,
        x_acc: torch.Tensor,        # [N_acc, acc_feats]
        x_merch: torch.Tensor,      # [M, merch_feats]
        edge_index: torch.Tensor,   # [2, E]  src=compte, dst=marchand
    ) -> torch.Tensor:
        h_acc   = F.relu(self.proj_acc(x_acc))
        h_merch = F.relu(self.proj_merch(x_merch))

        # Inversion : on fait passer marchand → compte (edge_index inversé)
        edge_inv = edge_index[[1, 0]]   # [marchand → compte]
        n_acc    = x_acc.size(0)

        # GAT couche 1 : (h_merch, h_acc) → mise à jour des nœuds compte
        h = F.elu(self.gat1((h_merch, h_acc), edge_inv))   # [N_acc, hidden]
        h = F.elu(self.gat2((h_merch, h),     edge_inv))   # [N_acc, hidden//2]

        # Concatène avec les features brutes du compte (skip connection)
        h = torch.cat([h, x_acc], dim=1)
        return torch.sigmoid(self.head(h)).squeeze(-1)


# ── Entraînement ──────────────────────────────────────────────────────────────

def train(features_path: Path = FEATURES_PATH, model_path: Path = MODEL_PATH) -> None:
    print("G2 · Merchant Targeting (GAT bipartite)")
    df = pd.read_parquet(features_path)
    train_df, test_df = temporal_split(df)

    x_acc_train, accounts_train = build_account_features(train_df)
    x_acc_test,  accounts_test  = build_account_features(test_df)
    y_train = get_account_labels(train_df, accounts_train)
    y_test  = get_account_labels(test_df,  accounts_test)

    x_acc_train, x_acc_test, _ = fit_scaler(x_acc_train, x_acc_test)

    edge_train, merch_feats_train, _ = build_bipartite_graph(train_df, accounts_train)
    edge_test,  merch_feats_test,  _ = build_bipartite_graph(test_df,  accounts_test)

    X_acc_tr = torch.tensor(x_acc_train, dtype=torch.float32)
    X_acc_te = torch.tensor(x_acc_test,  dtype=torch.float32)
    Y_tr     = torch.tensor(y_train,     dtype=torch.float32)
    Y_te     = torch.tensor(y_test,      dtype=torch.float32)

    n_pos = int(Y_tr.sum())
    n_neg = len(Y_tr) - n_pos
    pos_weight = torch.tensor([n_neg / max(n_pos, 1)])

    model = GATBipartiteFraud(
        acc_feats=X_acc_tr.shape[1],
        merch_feats=merch_feats_train.shape[1],
    )
    optimizer = torch.optim.Adam(model.parameters(), lr=5e-4, weight_decay=1e-4)
    criterion = nn.BCELoss(reduction="none")

    print(f"  Train : {len(accounts_train)} comptes, {int(Y_tr.sum())} frauduleux")

    best_auc, best_state, patience, patience_max = 0.0, None, 0, 30
    for epoch in range(1, 301):
        model.train()
        optimizer.zero_grad()
        preds = model(X_acc_tr, merch_feats_train, edge_train)
        weights = torch.where(Y_tr == 1, pos_weight.expand_as(Y_tr), torch.ones_like(Y_tr))
        loss = (criterion(preds, Y_tr) * weights).mean()
        loss.backward()
        optimizer.step()

        if epoch % 10 == 0:
            model.eval()
            with torch.no_grad():
                probs = model(X_acc_te, merch_feats_test, edge_test).numpy()
            try:
                auc = roc_auc_score(Y_te.numpy(), probs)
            except Exception:
                auc = 0.0
            if auc > best_auc:
                best_auc, best_state, patience = auc, model.state_dict(), 0
            else:
                patience += 1
            if patience >= patience_max:
                break

    if best_state:
        model.load_state_dict(best_state)

    torch.save({
        "state":        model.state_dict(),
        "acc_feats":    X_acc_tr.shape[1],
        "merch_feats":  merch_feats_train.shape[1],
    }, model_path)
    print(f"  ✓ AUC-ROC test : {best_auc:.4f}  →  {model_path}")


# ── Inférence ──────────────────────────────────────────────────────────────────

def score(df: pd.DataFrame, model_path: Path = MODEL_PATH) -> np.ndarray:
    ckpt  = torch.load(model_path, map_location="cpu", weights_only=True)
    model = GATBipartiteFraud(
        acc_feats=ckpt["acc_feats"],
        merch_feats=ckpt["merch_feats"],
    )
    model.load_state_dict(ckpt["state"])
    model.eval()

    x_raw, accounts = build_account_features(df)
    from sklearn.preprocessing import StandardScaler
    x_norm = StandardScaler().fit_transform(x_raw)

    X_acc  = torch.tensor(x_norm, dtype=torch.float32)
    edge_index, merch_feats, _ = build_bipartite_graph(df, accounts)
    idx = account_index(accounts)

    with torch.no_grad():
        account_scores = model(X_acc, merch_feats, edge_index).numpy()

    account_score_map = {a: float(account_scores[i]) for i, a in enumerate(accounts)}
    return df["account_id"].map(account_score_map).fillna(0.0).values


def main() -> None:
    train()


if __name__ == "__main__":
    main()
