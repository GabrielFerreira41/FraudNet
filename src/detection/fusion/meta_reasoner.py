"""
Sprint 4 — Meta-Raisonneur MARS
Agrège les scores de tous les agents, détecte les contradictions,
produit un score final et un flag d'investigation.
Usage : python -m src.detection.fusion.meta_reasoner
"""
from __future__ import annotations
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import pandas as pd

from src.detection.baseline.agent  import score as score_baseline, load_data, FEATURES_PATH
from src.detection.graph.agent     import score as score_graph

REPORTS_DIR = Path("reports")

# Poids initiaux par agent (ajustés dynamiquement en prod)
DEFAULT_WEIGHTS = {
    "baseline": 0.50,
    "sequence": 0.25,
    "graph":    0.25,
}

# Seuils de décision
THRESHOLD_BLOCK       = 0.70   # score final → bloquer automatiquement
THRESHOLD_INVESTIGATE = 0.40   # score final → investigation humaine
CONTRADICTION_DELTA   = 0.40   # écart entre agents → contradiction


# ---------------------------------------------------------------------------
# Structures de résultat
# ---------------------------------------------------------------------------

@dataclass
class AgentScores:
    baseline: float
    sequence: float
    graph:    float
    contradiction: bool      = False
    contradiction_detail: str = ""


@dataclass
class MARSDecision:
    transaction_id:  str
    score_final:     float
    decision:        str          # "BLOCK" | "INVESTIGATE" | "APPROVE"
    agent_scores:    AgentScores
    confidence:      float        # 0-1


# ---------------------------------------------------------------------------
# Agrégation
# ---------------------------------------------------------------------------

def _detect_contradiction(scores: dict[str, float], delta: float = CONTRADICTION_DELTA) -> tuple[bool, str]:
    vals = list(scores.values())
    spread = max(vals) - min(vals)
    if spread < delta:
        return False, ""
    high = [k for k, v in scores.items() if v == max(vals)]
    low  = [k for k, v in scores.items() if v == min(vals)]
    return True, f"{high[0]}={max(vals):.2f} vs {low[0]}={min(vals):.2f}"


def aggregate(
    scores: dict[str, float],
    weights: dict[str, float] = DEFAULT_WEIGHTS,
) -> tuple[float, bool, str]:
    """
    Retourne (score_final, contradiction_flag, contradiction_detail).
    Si contradiction détectée, majore légèrement le score final.
    """
    contradiction, detail = _detect_contradiction(scores)

    total_w = sum(weights[k] for k in scores)
    score   = sum(scores[k] * weights[k] for k in scores) / total_w

    if contradiction:
        # Un désaccord fort entre agents est lui-même un signal → boost +10%
        score = min(1.0, score * 1.10)

    return float(score), contradiction, detail


def decide(score_final: float) -> str:
    if score_final >= THRESHOLD_BLOCK:
        return "BLOCK"
    if score_final >= THRESHOLD_INVESTIGATE:
        return "INVESTIGATE"
    return "APPROVE"


# ---------------------------------------------------------------------------
# Pipeline MARS complet sur un DataFrame
# ---------------------------------------------------------------------------

def run_mars(df: pd.DataFrame, sequence_scores: np.ndarray | None = None) -> pd.DataFrame:
    """
    Retourne df enrichi avec les colonnes MARS :
      score_baseline, score_sequence, score_graph,
      score_mars, decision_mars, contradiction, confidence_mars
    """
    print("→ Agent Baseline...")
    s_baseline = score_baseline(df)

    print("→ Agent Graphe...")
    s_graph = score_graph(df)

    if sequence_scores is not None:
        s_sequence = sequence_scores
    else:
        # Si LSTM non dispo, utilise le score baseline comme proxy
        s_sequence = s_baseline.copy()

    results = []
    for i in range(len(df)):
        raw_scores = {
            "baseline": float(s_baseline[i]),
            "sequence": float(s_sequence[i]),
            "graph":    float(s_graph[i]),
        }
        score_f, contradiction, detail = aggregate(raw_scores)
        decision = decide(score_f)
        confidence = 1.0 - abs(score_f - THRESHOLD_BLOCK) / THRESHOLD_BLOCK

        results.append({
            "score_baseline":  raw_scores["baseline"],
            "score_sequence":  raw_scores["sequence"],
            "score_graph":     raw_scores["graph"],
            "score_mars":      score_f,
            "decision_mars":   decision,
            "contradiction":   contradiction,
            "confidence_mars": round(confidence, 4),
        })

    return df.assign(**{k: [r[k] for r in results] for k in results[0]})


# ---------------------------------------------------------------------------
# Évaluation du Meta-Raisonneur
# ---------------------------------------------------------------------------

def evaluate_mars(df_scored: pd.DataFrame, threshold: float = THRESHOLD_BLOCK) -> None:
    from sklearn.metrics import classification_report, roc_auc_score

    y_true  = df_scored["is_fraud"].astype(int)
    y_score = df_scored["score_mars"]
    y_pred  = (y_score >= threshold).astype(int)

    print("=" * 60)
    print("META-RAISONNEUR MARS — RAPPORT")
    print("=" * 60)
    print(f"  AUC-ROC : {roc_auc_score(y_true, y_score):.4f}")
    print(f"  Contradictions détectées : {df_scored['contradiction'].sum():,}")
    print()
    print(classification_report(y_true, y_pred, target_names=["Légitime", "Fraude"], digits=4))

    print("Décisions :")
    for dec, cnt in df_scored["decision_mars"].value_counts().items():
        print(f"  {dec:<15} {cnt:>8,}")

    # Recall par scénario sur les fraudes
    fraud_df = df_scored[df_scored["is_fraud"]].copy()
    print("\nRecall par scénario :")
    for scenario, grp in fraud_df.groupby("fraud_type"):
        detected = (grp["score_mars"] >= threshold).sum()
        print(f"  {scenario:<25} {detected}/{len(grp)}  ({detected/len(grp)*100:.0f}%)")
    print("=" * 60)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    print("Sprint 4 — Meta-Raisonneur MARS\n")
    df = pd.read_parquet(FEATURES_PATH)
    df["timestamp"] = pd.to_datetime(df["timestamp"])
    df = df.sort_values("timestamp")

    cutoff  = df["timestamp"].max() - pd.Timedelta(weeks=2)
    test_df = df[df["timestamp"] > cutoff].copy()

    print(f"Scoring de {len(test_df):,} transactions (set de test)...")
    test_scored = run_mars(test_df)

    evaluate_mars(test_scored)

    out = REPORTS_DIR / "mars_scores.parquet"
    REPORTS_DIR.mkdir(exist_ok=True)
    test_scored.to_parquet(out, index=False)
    print(f"\n✓ Scores MARS → {out}")


if __name__ == "__main__":
    main()
