"""
FraudNet Scoring API — FastAPI
Expose le pipeline MARS via HTTP.

Usage :
  uvicorn src.api.main:app --reload
  uvicorn src.api.main:app --host 0.0.0.0 --port 8000

Docs interactives : http://localhost:8000/docs
"""
from __future__ import annotations
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from src.api.schemas import (
    AgentScores, HealthResponse, SampleResponse,
    ScoringResponse, StatsResponse,
)
from src.api.predictor import FraudPredictor

_predictor: FraudPredictor | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _predictor
    print("Chargement des modèles MARS...")
    _predictor = FraudPredictor()
    s = _predictor.stats
    print(
        f"✓ {s['transactions_indexed']:,} transactions indexées "
        f"({s['accounts_indexed']} comptes, "
        f"fraude : {s['fraud_rate']*100:.3f}%)"
    )
    yield
    _predictor = None


app = FastAPI(
    title="FraudNet Scoring API",
    description=(
        "**MARS** — Multi-Agent Reasoning System pour la détection de fraude.\n\n"
        "Trois agents ML (Baseline LightGBM, LSTM comportemental, Graphe NetworkX) "
        "agrégés par un méta-raisonneur pondéré. "
        "Endpoint `/report` déclenche une analyse narrative via Mistral AI (cold path)."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)


def _get() -> FraudPredictor:
    if _predictor is None:
        raise HTTPException(status_code=503, detail="Modèles non chargés")
    return _predictor


# ---------------------------------------------------------------------------
# Système
# ---------------------------------------------------------------------------

@app.get("/health", response_model=HealthResponse, tags=["Système"])
def health():
    """Vérifie que l'API est opérationnelle et que les 3 modèles sont chargés."""
    p = _get()
    return HealthResponse(
        status="ok",
        models={"baseline": True, "sequence": True, "graph": True},
        transactions_indexed=p.stats["transactions_indexed"],
    )


@app.get("/stats", response_model=StatsResponse, tags=["Système"])
def stats():
    """Statistiques globales du jeu de données indexé en mémoire."""
    return StatsResponse(**_get().stats)


# ---------------------------------------------------------------------------
# Données
# ---------------------------------------------------------------------------

@app.get("/transactions/sample", response_model=SampleResponse, tags=["Données"])
def sample_transactions(n: int = Query(default=5, ge=1, le=20)):
    """
    Retourne n IDs de transactions (fraudes et légitimes) pour tester le scoring.
    Pratique pour récupérer des IDs valides sans connaître le dataset.
    """
    return SampleResponse(**_get().sample_ids(n))


# ---------------------------------------------------------------------------
# Scoring MARS
# ---------------------------------------------------------------------------

@app.get("/score/{transaction_id}", response_model=ScoringResponse, tags=["Scoring"])
def score_transaction(transaction_id: str):
    """
    Score une transaction via le pipeline MARS complet.

    - **Baseline** (50%) : LightGBM sur 20 features comportementales
    - **Séquence** (25%) : LSTM auto-encodeur, erreur de reconstruction
    - **Graphe** (25%) : LightGBM + propagation de suspicion NetworkX

    Décisions : `BLOCK` (≥ 0.70) · `INVESTIGATE` (≥ 0.40) · `APPROVE`
    """
    p = _get()
    try:
        result = p.score(transaction_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))

    return ScoringResponse(
        transaction_id=result["transaction_id"],
        score_mars=result["score_mars"],
        decision=result["decision"],
        agent_scores=AgentScores(**result["agent_scores"]),
        contradiction=result["contradiction"],
        confidence=result["confidence"],
        is_fraud_label=result.get("is_fraud_label"),
    )


# ---------------------------------------------------------------------------
# LLM Raisonneur (cold path)
# ---------------------------------------------------------------------------

@app.get("/report/{transaction_id}", tags=["LLM"])
def get_report(
    transaction_id: str,
    model: str = Query(
        default="mistral-small-latest",
        description="Modèle Mistral (mistral-small-latest | mistral-large-latest)",
    ),
):
    """
    Analyse narrative via Mistral AI (cold path, ~5-15 s).

    Retourne un rapport JSON structuré : verdict, justification,
    facteurs de risque, type de fraude suspecté, action recommandée.

    Nécessite `MISTRAL_API_KEY` dans `.env`.
    """
    if not os.environ.get("MISTRAL_API_KEY"):
        raise HTTPException(
            status_code=503,
            detail="MISTRAL_API_KEY non configuré dans .env",
        )

    p = _get()
    if not p.has_transaction(transaction_id):
        raise HTTPException(
            status_code=404,
            detail=f"Transaction {transaction_id} introuvable",
        )

    from src.detection.llm_reasoner.reasoner import reason
    try:
        report = reason(
            transaction_id,
            p.features_df,
            p.accounts_df,
            p.mars_df,
            model=model,
        )
        report["transaction_id"] = transaction_id
        return report
    except (EnvironmentError, ValueError) as exc:
        raise HTTPException(status_code=500, detail=str(exc))
