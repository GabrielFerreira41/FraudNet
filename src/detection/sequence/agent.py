"""
Sprint 2 — Agent Comportemental (LSTM)
Modélise l'historique de transactions de chaque compte comme une séquence.
Détecte les déviations par rapport au comportement appris.
Usage : python -m src.detection.sequence.agent
"""
from __future__ import annotations
import pickle
from pathlib import Path

import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, Dataset

FEATURES_PATH  = Path("data/generated/features.parquet")
MODEL_PATH     = Path("models/sequence_lstm.pt")
SCALER_PATH    = Path("models/sequence_scaler.pkl")
SEQ_LEN        = 10       # longueur de la fenêtre glissante
BATCH_SIZE     = 512
EPOCHS         = 20
HIDDEN_SIZE    = 64
LEARNING_RATE  = 1e-3

# Features numériques continues utilisées par le LSTM
SEQ_FEATURES = [
    "montant", "heure", "jour_semaine",
    "ratio_montant", "velocite_1h", "delta_min_prev_tx",
    "montant_cumul_1h", "ecart_montant_30tx",
]


# ---------------------------------------------------------------------------
# Normalisation min-max simple
# ---------------------------------------------------------------------------

class MinMaxScaler:
    def __init__(self):
        self.min_ = None
        self.scale_ = None

    def fit(self, X: np.ndarray) -> "MinMaxScaler":
        self.min_   = X.min(axis=0)
        self.scale_ = np.clip(X.max(axis=0) - X.min(axis=0), 1e-9, None)
        return self

    def transform(self, X: np.ndarray) -> np.ndarray:
        return (X - self.min_) / self.scale_

    def fit_transform(self, X: np.ndarray) -> np.ndarray:
        return self.fit(X).transform(X)


# ---------------------------------------------------------------------------
# Dataset : séquences glissantes de transactions légitimes
# ---------------------------------------------------------------------------

class SequenceDataset(Dataset):
    def __init__(self, sequences: np.ndarray):
        # sequences : (N, SEQ_LEN, n_features)
        self.X = torch.tensor(sequences[:, :-1, :], dtype=torch.float32)   # entrée
        self.y = torch.tensor(sequences[:, -1:, :], dtype=torch.float32)   # cible = dernière étape

    def __len__(self):  return len(self.X)
    def __getitem__(self, i): return self.X[i], self.y[i]


def build_sequences(df: pd.DataFrame, scaler: MinMaxScaler = None) -> tuple[np.ndarray, MinMaxScaler]:
    """Construit des séquences glissantes de longueur SEQ_LEN par compte."""
    df = df.sort_values(["account_id", "timestamp"]).reset_index(drop=True)
    X = df[SEQ_FEATURES].values.astype(np.float32)

    if scaler is None:
        scaler = MinMaxScaler()
        X = scaler.fit_transform(X)
    else:
        X = scaler.transform(X)

    seqs = []
    for _, grp in df.groupby("account_id"):
        idx = grp.index.tolist()
        vals = X[idx]
        if len(vals) < SEQ_LEN:
            continue
        for i in range(len(vals) - SEQ_LEN + 1):
            seqs.append(vals[i : i + SEQ_LEN])

    return np.array(seqs, dtype=np.float32), scaler


# ---------------------------------------------------------------------------
# Modèle LSTM auto-encodeur
# ---------------------------------------------------------------------------

class LSTMAutoEncoder(nn.Module):
    def __init__(self, n_features: int, hidden: int = HIDDEN_SIZE):
        super().__init__()
        self.encoder = nn.LSTM(n_features, hidden, batch_first=True)
        self.decoder = nn.Linear(hidden, n_features)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        # x : (batch, seq_len-1, n_features)
        out, _ = self.encoder(x)
        last    = out[:, -1, :]          # dernier état caché
        pred    = self.decoder(last)     # (batch, n_features)
        return pred.unsqueeze(1)         # (batch, 1, n_features)


# ---------------------------------------------------------------------------
# Entraînement
# ---------------------------------------------------------------------------

def train(features_path: Path = FEATURES_PATH) -> None:
    df = pd.read_parquet(features_path)
    df["timestamp"] = pd.to_datetime(df["timestamp"])
    df = df.sort_values("timestamp")

    # Entraîne uniquement sur les transactions légitimes du train set
    cutoff = df["timestamp"].max() - pd.Timedelta(weeks=2)
    train_df = df[(df["timestamp"] <= cutoff) & (~df["is_fraud"])]

    print(f"Séquences depuis {len(train_df):,} transactions légitimes...")
    seqs, scaler = build_sequences(train_df)
    print(f"  {len(seqs):,} séquences de longueur {SEQ_LEN}")

    dataset = SequenceDataset(seqs)
    loader  = DataLoader(dataset, batch_size=BATCH_SIZE, shuffle=True)

    model     = LSTMAutoEncoder(n_features=len(SEQ_FEATURES))
    optimizer = torch.optim.Adam(model.parameters(), lr=LEARNING_RATE)
    criterion = nn.MSELoss()

    model.train()
    for epoch in range(EPOCHS):
        total_loss = 0.0
        for X_batch, y_batch in loader:
            optimizer.zero_grad()
            pred = model(X_batch)
            loss = criterion(pred, y_batch)
            loss.backward()
            optimizer.step()
            total_loss += loss.item() * len(X_batch)
        avg = total_loss / len(dataset)
        if (epoch + 1) % 5 == 0:
            print(f"  Epoch {epoch+1}/{EPOCHS}  loss={avg:.6f}")

    MODEL_PATH.parent.mkdir(exist_ok=True)
    torch.save(model.state_dict(), MODEL_PATH)
    with open(SCALER_PATH, "wb") as f:
        pickle.dump(scaler, f)
    print(f"✓ LSTM sauvegardé → {MODEL_PATH}")


# ---------------------------------------------------------------------------
# Score : erreur de reconstruction = anomalie comportementale
# ---------------------------------------------------------------------------

def score(df: pd.DataFrame) -> np.ndarray:
    """
    Retourne un score d'anomalie [0, ∞) par transaction.
    Plus le score est élevé, plus la transaction dévie du comportement habituel.
    Normalisé en [0,1] via sigmoid pour compatibilité avec les autres agents.
    """
    with open(SCALER_PATH, "rb") as f:
        scaler = pickle.load(f)

    model = LSTMAutoEncoder(n_features=len(SEQ_FEATURES))
    model.load_state_dict(torch.load(MODEL_PATH, weights_only=True))
    model.eval()

    df = df.sort_values(["account_id", "timestamp"]).reset_index(drop=True)
    X = scaler.transform(df[SEQ_FEATURES].values.astype(np.float32))
    scores = np.zeros(len(df), dtype=np.float32)

    with torch.no_grad():
        for _, grp in df.groupby("account_id"):
            idx  = grp.index.tolist()
            vals = X[idx]
            if len(vals) < SEQ_LEN:
                # Cold-start : score moyen de 0.5
                scores[idx] = 0.5
                continue
            for i in range(len(vals) - SEQ_LEN + 1):
                seq  = torch.tensor(vals[i : i + SEQ_LEN - 1]).unsqueeze(0)
                pred = model(seq).squeeze().numpy()
                err  = float(np.mean((vals[i + SEQ_LEN - 1] - pred) ** 2))
                scores[idx[i + SEQ_LEN - 1]] = err

    # Normalise en [0,1] via sigmoid
    return 1 / (1 + np.exp(-scores * 10))


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    print("Sprint 2 — Entraînement agent comportemental (LSTM)...")
    train()
    print("\nLance 'python -m src.detection.fusion.meta_reasoner' après tous les agents.")


if __name__ == "__main__":
    main()
