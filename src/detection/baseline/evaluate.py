"""
Sprint 1 — Évaluation de l'agent baseline.
Produit : reports/baseline_report.txt + reports/baseline_shap.png
Usage   : python -m src.detection.baseline.evaluate
"""
from __future__ import annotations
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
import shap
from sklearn.metrics import (
    classification_report, confusion_matrix,
    precision_recall_curve, roc_auc_score, average_precision_score,
)

from src.detection.baseline.agent import load_data, load_model, _xy, FEATURE_COLS, MODEL_PATH

REPORTS_DIR = Path("reports")


# ---------------------------------------------------------------------------
# Seuil optimal : maximise F1 sur la courbe PR
# ---------------------------------------------------------------------------

def best_threshold(y_true: np.ndarray, y_scores: np.ndarray) -> float:
    precision, recall, thresholds = precision_recall_curve(y_true, y_scores)
    f1 = 2 * precision * recall / np.clip(precision + recall, 1e-9, None)
    idx = np.argmax(f1[:-1])
    return float(thresholds[idx])


# ---------------------------------------------------------------------------
# Rapport textuel
# ---------------------------------------------------------------------------

def build_report(
    y_true: np.ndarray,
    y_scores: np.ndarray,
    threshold: float,
    test_df: pd.DataFrame,
) -> str:
    y_pred = (y_scores >= threshold).astype(int)

    auc_roc = roc_auc_score(y_true, y_scores)
    auc_pr  = average_precision_score(y_true, y_scores)
    cm      = confusion_matrix(y_true, y_pred)
    tn, fp, fn, tp = cm.ravel()

    lines = [
        "=" * 60,
        "AGENT BASELINE — RAPPORT D'ÉVALUATION",
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

    # Recall par scénario de fraude
    lines += ["Recall par scénario de fraude", "-" * 40]
    fraud_test = test_df[test_df["is_fraud"]].copy()
    fraud_test["score"] = y_scores[test_df["is_fraud"].values]
    fraud_test["detected"] = fraud_test["score"] >= threshold

    for scenario, grp in fraud_test.groupby("fraud_type"):
        recall_s = grp["detected"].mean()
        n = len(grp)
        lines.append(f"  {scenario:<25} {recall_s*100:5.1f}%  ({grp['detected'].sum()}/{n})")

    lines += ["", "=" * 60]
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Graphiques
# ---------------------------------------------------------------------------

def plot_pr_curve(y_true, y_scores, threshold, save_path: Path) -> None:
    precision, recall, thresholds = precision_recall_curve(y_true, y_scores)

    fig, axes = plt.subplots(1, 2, figsize=(13, 5))
    fig.suptitle("Agent Baseline — Courbes d'évaluation", fontsize=13, fontweight="bold")

    # Courbe PR
    axes[0].plot(recall, precision, color="#636EFA", linewidth=2)
    # Point du seuil optimal
    idx = np.argmin(np.abs(thresholds - threshold)) if len(thresholds) > 0 else 0
    axes[0].scatter(recall[idx], precision[idx], color="#EF553B", s=100, zorder=5,
                    label=f"Seuil optimal ({threshold:.3f})")
    axes[0].set_xlabel("Recall")
    axes[0].set_ylabel("Precision")
    axes[0].set_title("Courbe Precision-Recall")
    axes[0].legend()
    axes[0].grid(alpha=0.3)

    # Distribution des scores
    scores_legit = y_scores[y_true == 0]
    scores_fraud = y_scores[y_true == 1]
    axes[1].hist(scores_legit, bins=60, alpha=0.6, color="#636EFA",
                 label=f"Légitimes (n={len(scores_legit):,})", density=True)
    axes[1].hist(scores_fraud, bins=20, alpha=0.8, color="#EF553B",
                 label=f"Fraudes (n={len(scores_fraud)})", density=True)
    axes[1].axvline(threshold, color="black", linestyle="--", linewidth=1.5,
                    label=f"Seuil={threshold:.3f}")
    axes[1].set_xlabel("Score de risque")
    axes[1].set_ylabel("Densité")
    axes[1].set_title("Distribution des scores")
    axes[1].legend(fontsize=9)
    axes[1].grid(alpha=0.3)

    plt.tight_layout()
    plt.savefig(save_path, dpi=150, bbox_inches="tight")
    plt.close()
    print(f"✓ Courbes PR → {save_path}")


def plot_shap(model, X_test_sample: pd.DataFrame, save_path: Path) -> None:
    explainer = shap.TreeExplainer(model)
    shap_values = explainer.shap_values(X_test_sample)

    # Pour classification binaire LightGBM, shap_values peut être une liste
    if isinstance(shap_values, list):
        sv = shap_values[1]
    else:
        sv = shap_values

    fig, ax = plt.subplots(figsize=(9, 6))
    shap.summary_plot(sv, X_test_sample, show=False, plot_size=None)
    plt.title("SHAP — Importance des features (Agent Baseline)", fontweight="bold", pad=12)
    plt.tight_layout()
    plt.savefig(save_path, dpi=150, bbox_inches="tight")
    plt.close()
    print(f"✓ SHAP → {save_path}")


def plot_feature_importance(model, save_path: Path) -> None:
    imp = pd.DataFrame({
        "feature": FEATURE_COLS,
        "gain":    model.feature_importance(importance_type="gain"),
        "split":   model.feature_importance(importance_type="split"),
    }).sort_values("gain", ascending=True)

    fig, axes = plt.subplots(1, 2, figsize=(13, 6))
    fig.suptitle("Importance des features — Agent Baseline", fontsize=13, fontweight="bold")

    for ax, col, title in zip(axes, ["gain", "split"], ["Gain", "Splits"]):
        ax.barh(imp["feature"], imp[col], color="#636EFA")
        ax.set_title(title)
        ax.grid(axis="x", alpha=0.3)
        ax.set_xlabel(title)

    plt.tight_layout()
    plt.savefig(save_path, dpi=150, bbox_inches="tight")
    plt.close()
    print(f"✓ Feature importance → {save_path}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    REPORTS_DIR.mkdir(exist_ok=True)

    print("Chargement du modèle et des données test...")
    model = load_model(MODEL_PATH)
    _, test_df = load_data()
    X_test, y_test = _xy(test_df)

    print("Scoring...")
    y_scores = model.predict(X_test)

    threshold = best_threshold(y_test.values, y_scores)
    print(f"Seuil optimal : {threshold:.4f}")

    report = build_report(y_test.values, y_scores, threshold, test_df)
    print("\n" + report)

    report_path = REPORTS_DIR / "baseline_report.txt"
    report_path.write_text(report)
    print(f"\n✓ Rapport → {report_path}")

    plot_pr_curve(y_test.values, y_scores, threshold, REPORTS_DIR / "baseline_pr_curve.png")

    # SHAP sur un échantillon (les fraudes + sample légitimes pour équilibrer)
    fraud_idx = X_test[y_test.values == 1].index
    legit_sample = X_test[y_test.values == 0].sample(min(500, (y_test==0).sum()), random_state=42)
    shap_sample = pd.concat([X_test.loc[fraud_idx], legit_sample])
    plot_shap(model, shap_sample, REPORTS_DIR / "baseline_shap.png")

    plot_feature_importance(model, REPORTS_DIR / "baseline_feature_importance.png")


if __name__ == "__main__":
    main()
