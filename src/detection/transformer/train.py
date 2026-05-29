"""
FraudTransformer — Boucle d'entraînement.

Sprint 2 — Agent Comportemental v2 (Transformer intra-compte)

Usage : python -m src.detection.transformer.train
"""
from __future__ import annotations
import math
import time
from pathlib import Path

import matplotlib.pyplot as plt
import mlflow
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from sklearn.metrics import (
    average_precision_score, classification_report,
    confusion_matrix, precision_recall_curve, roc_auc_score,
)
from torch.optim import AdamW
from torch.utils.data import DataLoader

from src.detection.transformer.dataset import (
    ACCOUNTS_PATH, FEATURES_PATH,
    FeatureScaler, FraudSequenceDataset,
    load_and_split, prepare_accounts,
)
from src.detection.transformer.model import FraudTransformer, NUMERIC_COLS

# ─── Chemins ─────────────────────────────────────────────────────────────────

MODEL_PATH  = Path("models/transformer.pt")
REPORTS_DIR = Path("reports")

# ─── Hyperparamètres ─────────────────────────────────────────────────────────

EPOCHS       = 20
BATCH_SIZE   = 512
LR           = 3e-4
WEIGHT_DECAY = 1e-2
WARMUP_FRAC  = 0.05   # fraction du total steps pour warmup linéaire

D_MODEL  = 64
NHEAD    = 4
N_LAYERS = 3
DIM_FF   = 128
DROPOUT  = 0.1


# ─── Device ──────────────────────────────────────────────────────────────────

def _get_device() -> torch.device:
    if torch.cuda.is_available():
        return torch.device("cuda")
    if torch.backends.mps.is_available():
        return torch.device("mps")
    return torch.device("cpu")


# ─── Scheduler : warmup linéaire puis cosine decay ───────────────────────────

class WarmupCosineScheduler:
    """Warmup linéaire sur warmup_steps, puis décroissance cosine jusqu'à total_steps."""

    def __init__(self, optimizer, warmup_steps: int, total_steps: int) -> None:
        self.optimizer    = optimizer
        self.warmup_steps = warmup_steps
        self.total_steps  = total_steps
        self._step        = 0
        self._base_lr     = [g["lr"] for g in optimizer.param_groups]

    def step(self) -> None:
        self._step += 1
        s, w, T = self._step, self.warmup_steps, self.total_steps
        if s <= w:
            scale = s / max(w, 1)
        else:
            progress = (s - w) / max(T - w, 1)
            scale = 0.5 * (1.0 + math.cos(math.pi * progress))
        for i, g in enumerate(self.optimizer.param_groups):
            g["lr"] = self._base_lr[i] * scale


# ─── Checkpoint ──────────────────────────────────────────────────────────────

def _save_checkpoint(
    model: FraudTransformer,
    scaler: FeatureScaler,
    path: Path,
    revenu_max: float | None = None,
) -> None:
    path.parent.mkdir(exist_ok=True)
    torch.save({
        "model_state":     model.state_dict(),
        "scaler_min":      scaler.min_,
        "scaler_scale":    scaler.scale_,
        "d_model":         D_MODEL,
        "nhead":           NHEAD,
        "num_layers":      N_LAYERS,
        "dim_feedforward": DIM_FF,
        "revenu_max":      revenu_max,
    }, path)


def load_model_and_scaler(
    model_path: Path = MODEL_PATH,
    device: torch.device | None = None,
) -> tuple[FraudTransformer, FeatureScaler]:
    """Charge le checkpoint → (model en eval mode, scaler). Utilisé par l'interface MARS."""
    if device is None:
        device = _get_device()
    ckpt = torch.load(model_path, map_location=device, weights_only=False)

    scaler = FeatureScaler()
    scaler.min_   = ckpt["scaler_min"]
    scaler.scale_ = ckpt["scaler_scale"]

    model = FraudTransformer(
        d_model        = ckpt.get("d_model", D_MODEL),
        nhead          = ckpt.get("nhead", NHEAD),
        num_layers     = ckpt.get("num_layers", N_LAYERS),
        dim_feedforward= ckpt.get("dim_feedforward", DIM_FF),
        dropout        = 0.0,
    )
    model.load_state_dict(ckpt["model_state"])
    model.eval().to(device)
    return model, scaler


# ─── Training step ───────────────────────────────────────────────────────────

def _train_epoch(
    loader: DataLoader,
    model: FraudTransformer,
    criterion: nn.BCEWithLogitsLoss,
    optimizer: AdamW,
    scheduler: WarmupCosineScheduler,
    device: torch.device,
) -> float:
    model.train()
    total_loss, n = 0.0, 0

    for batch in loader:
        optimizer.zero_grad()
        logits = model(
            numeric       = batch["numeric"].to(device),
            device_idx    = batch["device"].to(device),
            categorie_idx = batch["categorie"].to(device),
            archetype_idx = batch["archetype"].to(device),
            delta_minutes = batch["delta"].to(device),
            profile_arch  = batch["prof_arch"].to(device),
            profile_prov  = batch["prof_prov"].to(device),
            profile_rev   = batch["prof_rev"].to(device),
            profile_age   = batch["prof_age"].to(device),
            padding_mask  = batch["padding_mask"].to(device),
        )
        loss = criterion(logits, batch["label"].to(device))
        loss.backward()
        nn.utils.clip_grad_norm_(model.parameters(), 1.0)
        optimizer.step()
        scheduler.step()
        total_loss += loss.item()
        n += 1

    return total_loss / max(n, 1)


# ─── Inférence ───────────────────────────────────────────────────────────────

@torch.no_grad()
def _score_dataset(
    dataset: FraudSequenceDataset,
    model: FraudTransformer,
    device: torch.device,
    batch_size: int = 512,
) -> tuple[np.ndarray, np.ndarray]:
    """Retourne (scores [0,1], labels {0,1}) dans l'ordre du dataset."""
    model.eval()
    loader = DataLoader(dataset, batch_size=batch_size, shuffle=False, num_workers=0)
    all_scores, all_labels = [], []

    for batch in loader:
        logits = model(
            numeric       = batch["numeric"].to(device),
            device_idx    = batch["device"].to(device),
            categorie_idx = batch["categorie"].to(device),
            archetype_idx = batch["archetype"].to(device),
            delta_minutes = batch["delta"].to(device),
            profile_arch  = batch["prof_arch"].to(device),
            profile_prov  = batch["prof_prov"].to(device),
            profile_rev   = batch["prof_rev"].to(device),
            profile_age   = batch["prof_age"].to(device),
            padding_mask  = batch["padding_mask"].to(device),
        )
        all_scores.append(torch.sigmoid(logits).cpu().numpy())
        all_labels.append(batch["label"].numpy())

    return np.concatenate(all_scores), np.concatenate(all_labels)


def score(
    transactions: pd.DataFrame,
    accounts_df: pd.DataFrame,
    model_path: Path = MODEL_PATH,
) -> np.ndarray:
    """
    Interface MARS — score de risque [0,1] par transaction.

    transactions : DataFrame avec les mêmes colonnes que features.parquet
    accounts_df  : DataFrame accounts.parquet (pour les profils statiques)
    """
    device = _get_device()
    model, scaler = load_model_and_scaler(model_path, device)
    accounts = prepare_accounts(accounts_df)
    ds = FraudSequenceDataset(transactions, accounts, scaler)
    scores, _ = _score_dataset(ds, model, device)
    return scores


# ─── Évaluation et rapport ───────────────────────────────────────────────────

def _best_threshold(y_true: np.ndarray, y_scores: np.ndarray) -> float:
    prec, rec, thr = precision_recall_curve(y_true, y_scores)
    f1 = 2 * prec * rec / np.clip(prec + rec, 1e-9, None)
    return float(thr[np.argmax(f1[:-1])])


def _iter_dataset_order(df: pd.DataFrame):
    """Itère df dans le même ordre que FraudSequenceDataset._build_sequences."""
    for _, grp in df.groupby("account_id", sort=False):
        yield from grp.sort_values("timestamp").itertuples()


def _build_report(
    y_true: np.ndarray,
    y_scores: np.ndarray,
    threshold: float,
    test_df: pd.DataFrame,
) -> str:
    y_pred  = (y_scores >= threshold).astype(int)
    auc_roc = roc_auc_score(y_true, y_scores)
    auc_pr  = average_precision_score(y_true, y_scores)
    cm      = confusion_matrix(y_true, y_pred)
    tn, fp, fn, tp = cm.ravel()

    lines = [
        "=" * 60,
        "AGENT COMPORTEMENTAL v2 (TRANSFORMER) — RAPPORT D'ÉVALUATION",
        "=" * 60,
        f"  Threshold optimal      : {threshold:.4f}",
        f"  AUC-ROC                : {auc_roc:.4f}",
        f"  AUC-PR (avg precision) : {auc_pr:.4f}",
        "",
        "Matrice de confusion",
        f"  Vrais négatifs  (TN) : {tn:,}",
        f"  Faux positifs   (FP) : {fp:,}  ← légitimes bloqués à tort",
        f"  Faux négatifs   (FN) : {fn:,}  ← fraudes non détectées",
        f"  Vrais positifs  (TP) : {tp:,}",
        "",
        classification_report(y_true, y_pred, target_names=["Légitime", "Fraude"], digits=4),
    ]

    # Recall par scénario — on reconstruit la correspondance index→score
    # (même ordre d'itération que dans FraudSequenceDataset._build_sequences)
    score_by_idx = {
        row.Index: y_scores[i]
        for i, row in enumerate(_iter_dataset_order(test_df))
    }

    lines += ["Recall par scénario de fraude", "-" * 40]
    fraud_test = test_df[test_df["is_fraud"]].copy()
    fraud_test["score"]    = fraud_test.index.map(score_by_idx)
    fraud_test["detected"] = fraud_test["score"] >= threshold

    for scenario, grp in fraud_test.groupby("fraud_type"):
        r = grp["detected"].mean()
        lines.append(f"  {scenario:<25} {r*100:5.1f}%  ({grp['detected'].sum()}/{len(grp)})")

    lines += ["", "=" * 60]
    return "\n".join(lines)


def _plot_pr_curve(y_true: np.ndarray, y_scores: np.ndarray, threshold: float, path: Path) -> None:
    prec, rec, thr = precision_recall_curve(y_true, y_scores)

    fig, axes = plt.subplots(1, 2, figsize=(13, 5))
    fig.suptitle("Agent Comportemental v2 (Transformer) — Courbes d'évaluation",
                 fontsize=13, fontweight="bold")

    axes[0].plot(rec, prec, color="#636EFA", linewidth=2)
    idx = np.argmin(np.abs(thr - threshold)) if len(thr) else 0
    axes[0].scatter(rec[idx], prec[idx], color="#EF553B", s=100, zorder=5,
                    label=f"Seuil optimal ({threshold:.3f})")
    axes[0].set_xlabel("Recall")
    axes[0].set_ylabel("Precision")
    axes[0].set_title("Courbe Precision-Recall")
    axes[0].legend()
    axes[0].grid(alpha=0.3)

    axes[1].hist(y_scores[y_true == 0], bins=60, alpha=0.6, color="#636EFA",
                 label=f"Légitimes (n={int((y_true == 0).sum()):,})", density=True)
    axes[1].hist(y_scores[y_true == 1], bins=20, alpha=0.8, color="#EF553B",
                 label=f"Fraudes (n={int(y_true.sum())})", density=True)
    axes[1].axvline(threshold, color="black", linestyle="--", linewidth=1.5,
                    label=f"Seuil={threshold:.3f}")
    axes[1].set_xlabel("Score de risque")
    axes[1].set_ylabel("Densité")
    axes[1].set_title("Distribution des scores")
    axes[1].legend(fontsize=9)
    axes[1].grid(alpha=0.3)

    plt.tight_layout()
    plt.savefig(path, dpi=150, bbox_inches="tight")
    plt.close()
    print(f"✓ Courbes PR → {path}")


# ─── Point d'entrée ──────────────────────────────────────────────────────────

def train(
    features_path: Path = FEATURES_PATH,
    accounts_path: Path = ACCOUNTS_PATH,
    model_path: Path = MODEL_PATH,
    epochs: int = EPOCHS,
    batch_size: int = BATCH_SIZE,
    lr: float = LR,
    weight_decay: float = WEIGHT_DECAY,
    seed: int = 42,
) -> FraudTransformer:
    torch.manual_seed(seed)
    np.random.seed(seed)

    device = _get_device()
    print(f"Device : {device}")

    # ── Données ──────────────────────────────────────────────────────────────
    print("Chargement et split temporel...")
    train_df, test_df, acc_df = load_and_split(features_path, accounts_path)

    revenu_max = float(acc_df["revenu_mensuel"].max())
    accounts   = prepare_accounts(acc_df, revenu_max=revenu_max)

    scaler = FeatureScaler().fit(train_df[NUMERIC_COLS].values.astype(np.float32))

    print("Construction des séquences (train + test)...")
    train_ds = FraudSequenceDataset(train_df, accounts, scaler)
    test_ds  = FraudSequenceDataset(test_df,  accounts, scaler)

    n_leg_tr, n_fr_tr = train_ds.class_counts
    n_leg_te, n_fr_te = test_ds.class_counts
    print(f"Train : {len(train_ds):,} séquences | fraudes : {n_fr_tr} ({n_fr_tr/len(train_ds)*100:.3f}%)")
    print(f"Test  : {len(test_ds):,} séquences  | fraudes : {n_fr_te} ({n_fr_te/len(test_ds)*100:.3f}%)")

    pin_mem = device.type == "cuda"
    train_loader = DataLoader(
        train_ds, batch_size=batch_size, shuffle=True,
        num_workers=0, pin_memory=pin_mem,
    )

    # ── Modèle ───────────────────────────────────────────────────────────────
    model = FraudTransformer(
        d_model=D_MODEL, nhead=NHEAD, num_layers=N_LAYERS,
        dim_feedforward=DIM_FF, dropout=DROPOUT,
    ).to(device)
    print(f"Paramètres : {model.n_params():,}")

    pos_weight = train_ds.pos_weight.to(device)
    criterion  = nn.BCEWithLogitsLoss(pos_weight=pos_weight)
    optimizer  = AdamW(model.parameters(), lr=lr, weight_decay=weight_decay)

    total_steps  = epochs * len(train_loader)
    warmup_steps = int(total_steps * WARMUP_FRAC)
    scheduler    = WarmupCosineScheduler(optimizer, warmup_steps, total_steps)

    print(f"Steps : {total_steps} total | {warmup_steps} warmup | pos_weight={pos_weight.item():.2f}\n")

    # ── Boucle d'entraînement ─────────────────────────────────────────────────
    best_auc_pr = 0.0

    mlflow.set_experiment("fraudnet-transformer")
    with mlflow.start_run(run_name="train"):
        mlflow.log_params({
            "epochs":          epochs,
            "batch_size":      batch_size,
            "lr":              lr,
            "weight_decay":    weight_decay,
            "d_model":         D_MODEL,
            "nhead":           NHEAD,
            "num_layers":      N_LAYERS,
            "dim_feedforward": DIM_FF,
            "dropout":         DROPOUT,
            "n_train":         len(train_ds),
            "n_test":          len(test_ds),
            "fraud_rate_train": round(n_fr_tr / len(train_ds), 5),
            "pos_weight":      round(float(pos_weight), 2),
            "n_params":        model.n_params(),
        })

        for epoch in range(1, epochs + 1):
            t0   = time.time()
            loss = _train_epoch(train_loader, model, criterion, optimizer, scheduler, device)

            scores, labels = _score_dataset(test_ds, model, device, batch_size)
            auc_pr  = float(average_precision_score(labels, scores))
            auc_roc = float(roc_auc_score(labels, scores))

            print(
                f"Epoch {epoch:02d}/{epochs} | "
                f"loss={loss:.4f} | AUC-PR={auc_pr:.4f} | AUC-ROC={auc_roc:.4f} | "
                f"{time.time() - t0:.1f}s"
            )
            mlflow.log_metrics({
                "train_loss": round(loss,    4),
                "auc_pr":    round(auc_pr,  4),
                "auc_roc":   round(auc_roc, 4),
            }, step=epoch)

            if auc_pr > best_auc_pr:
                best_auc_pr = auc_pr
                _save_checkpoint(model, scaler, model_path, revenu_max)
                print(f"  ✓ Checkpoint → {model_path}  (AUC-PR={auc_pr:.4f})")

        # ── Évaluation finale sur le meilleur checkpoint ──────────────────────
        print("\nÉvaluation finale (meilleur checkpoint)...")
        best_model, _ = load_model_and_scaler(model_path, device)
        scores, labels = _score_dataset(test_ds, best_model, device, batch_size)

        threshold = _best_threshold(labels, scores)
        report    = _build_report(labels, scores, threshold, test_df)
        print("\n" + report)

        REPORTS_DIR.mkdir(exist_ok=True)
        report_path = REPORTS_DIR / "transformer_report.txt"
        report_path.write_text(report)
        print(f"✓ Rapport → {report_path}")

        pr_path = REPORTS_DIR / "transformer_pr_curve.png"
        _plot_pr_curve(labels, scores, threshold, pr_path)

        mlflow.log_metrics({
            "final_auc_pr":  round(float(average_precision_score(labels, scores)), 4),
            "final_auc_roc": round(float(roc_auc_score(labels, scores)), 4),
            "threshold":     round(threshold, 4),
        })
        mlflow.log_artifact(str(model_path))
        mlflow.log_artifact(str(report_path))
        mlflow.log_artifact(str(pr_path))
        print("✓ Métriques et artefacts loggés dans MLflow")

    return best_model


def main() -> None:
    train()


if __name__ == "__main__":
    main()
