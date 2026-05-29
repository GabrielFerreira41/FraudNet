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
from pydantic import BaseModel

from src.api.schemas import (
    AgentScores, AnalyzeAgentScores, AnalyzeRequest, AnalyzeResponse,
    HealthResponse, NarrativeResponse, SampleResponse,
    ScoringResponse, StatsResponse,
)
from src.api.predictor import FraudPredictor
from src.api import generator as gen_module

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
    allow_methods=["GET", "POST"],
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

@app.get("/transactions/{transaction_id}/details", tags=["Données"])
def transaction_details(transaction_id: str):
    """Retourne les champs bruts d'une transaction (pour pré-remplir le formulaire live)."""
    detail = _get().transaction_details(transaction_id)
    if detail is None:
        raise HTTPException(status_code=404, detail=f"Transaction {transaction_id} introuvable")
    return detail


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
# Métriques modèle (pour dashboard desktop)
# ---------------------------------------------------------------------------

@app.get("/metrics", tags=["Système"])
def metrics():
    """
    Métriques de performance réelles calculées sur le set de test
    (mars_scores.parquet — dernières 2 semaines).
    """
    p = _get()
    if p.mars_df is None:
        raise HTTPException(status_code=404, detail="mars_scores.parquet introuvable")

    from sklearn.metrics import roc_auc_score, precision_score, recall_score, f1_score

    df   = p.mars_df
    y    = df["is_fraud"].astype(int)
    sc   = df["score_mars"]
    pred = (sc >= 0.70).astype(int)

    per_scenario: dict = {}
    if "fraud_type" in df.columns:
        fraud_df = df[df["is_fraud"]]
        for ftype, grp in fraud_df.groupby("fraud_type"):
            detected = (grp["score_mars"] >= 0.40).sum()
            per_scenario[str(ftype)] = round(float(detected / len(grp)), 3)

    decisions = df["decision_mars"].value_counts().to_dict()

    return {
        "auc_roc":         round(float(roc_auc_score(y, sc)), 4),
        "recall":          round(float(recall_score(y, pred)), 4),
        "precision":       round(float(precision_score(y, pred, zero_division=0)), 4),
        "f1":              round(float(f1_score(y, pred, zero_division=0)), 4),
        "n_fraud":         int(y.sum()),
        "n_total":         len(y),
        "n_blocked":       int(decisions.get("BLOCK", 0)),
        "n_investigate":   int(decisions.get("INVESTIGATE", 0)),
        "n_approved":      int(decisions.get("APPROVE", 0)),
        "per_scenario":    per_scenario,
    }


# ---------------------------------------------------------------------------
# Admin — comptes
# ---------------------------------------------------------------------------

@app.get("/mlflow/runs", tags=["Système"])
def mlflow_runs():
    """Historique des runs MLflow (evaluate) pour la vue Performance."""
    try:
        import mlflow
        import pandas as pd
        df = mlflow.search_runs(
            experiment_names=["fraudnet-baseline"],
            order_by=["start_time ASC"],
        )
        if df.empty:
            return []
        result = []
        for _, row in df.iterrows():
            if row.get("tags.mlflow.runName") != "evaluate":
                continue
            metrics = {
                col[len("metrics."):]: float(row[col])
                for col in df.columns
                if col.startswith("metrics.") and pd.notna(row[col])
            }
            result.append({
                "run_id":     row["run_id"],
                "start_time": row["start_time"].isoformat() if pd.notna(row.get("start_time")) else None,
                **metrics,
            })
        return result
    except Exception:
        return []


# ---------------------------------------------------------------------------
# Breach Radar — surveillance des fuites de données mondiales
# ---------------------------------------------------------------------------

@app.delete("/breach-intel/clear", tags=["Breach Radar"])
def breach_clear():
    """Supprime tous les incidents de la base breach_events."""
    from src.api.breach_store import clear_breaches
    n = clear_breaches()
    return {"deleted": n}


@app.get("/breach-scan", tags=["Breach Radar"])
async def breach_scan():
    """
    Scanne les flux RSS de cybersécurité (BleepingComputer, TheHackerNews) et
    utilise Claude Haiku pour extraire les fuites de données structurées avec
    coordonnées géographiques.
    """
    from src.api.breach_scanner import scan_breaches
    breaches = await scan_breaches()
    return {"breaches": breaches, "count": len(breaches)}

@app.get("/accounts", tags=["Admin"])
def list_accounts():
    """Liste des 1 000 comptes avec niveau de risque et statistiques agrégées."""
    return _get().account_list()


@app.get("/accounts/lookup", tags=["Admin"])
def accounts_lookup():
    """Liste simplifiée des comptes pour le formulaire d'analyse live."""
    p = _get()
    return [
        {"account_id": a["account_id"], "label": f"{a['prenom']} {a['nom']} — {a['archetype']}"}
        for a in p.account_list()
    ]


@app.get("/accounts/{account_id}", tags=["Admin"])
def get_account(account_id: str):
    """Détail d'un compte : metadata + 20 dernières transactions avec scores MARS."""
    detail = _get().account_detail(account_id)
    if detail is None:
        raise HTTPException(status_code=404, detail=f"Compte {account_id} introuvable")
    return detail


# ---------------------------------------------------------------------------
# Graph — réseau de fraude
# ---------------------------------------------------------------------------

@app.get("/stats/dataset", tags=["Système"])
def stats_dataset(
    archetype:  str = Query(default="all"),
    province:   str = Query(default="all"),
    fraud_type: str = Query(default="all"),
    dataset:    str = Query(default="main"),
):
    """Agrégations filtrées pour la vue exploration de données."""
    return _get().dataset_stats(
        archetype=archetype, province=province,
        fraud_type=fraud_type, dataset=dataset,
    )


@app.get("/graph/network", tags=["Graph"])
def graph_network(
    max_peers: int = Query(default=25, ge=0,  le=500, description="Nombre max de comptes pairs"),
    max_fraud: int = Query(default=50, ge=1,  le=500, description="Nombre max de comptes frauduleux"),
):
    """
    Réseau de fraude pour visualisation D3.
    Nœuds : comptes frauduleux + pairs légitimes + marchands impliqués.
    Arêtes : transactions frauduleuses et légitimes vers les marchands.
    """
    return _get().graph_network(max_peers=max_peers, max_fraud=max_fraud)


# ---------------------------------------------------------------------------
# Analyse live — transaction inconnue
# ---------------------------------------------------------------------------

@app.post("/analyze", response_model=AnalyzeResponse, tags=["Scoring"])
def analyze_transaction(req: AnalyzeRequest):
    """
    Analyse une transaction saisie manuellement via le pipeline MARS.

    - Calcule les features comportementales depuis l'historique du compte
    - Score Baseline LightGBM (live)
    - Scores GNN G1/G2/G3 depuis le cache pré-calculé par compte
    - Agrégation + décision MARS
    """
    p   = _get()
    res = p.analyze_live(req.model_dump())
    return AnalyzeResponse(
        decision         = res["decision"],
        score_mars       = res["score_mars"],
        confidence       = res["confidence"],
        contradiction    = res["contradiction"],
        agent_scores     = AnalyzeAgentScores(**res["agent_scores"]),
        risk_factors     = res["risk_factors"],
        features         = res["features"],
        account_context  = res.get("account_context"),
    )


@app.post("/analyze/narrative", response_model=NarrativeResponse, tags=["LLM"])
def analyze_narrative(req: AnalyzeRequest):
    """
    Génère une analyse narrative de la transaction via Claude API.

    Nécessite `ANTHROPIC_API_KEY` dans `.env`.
    Fallback automatique vers une analyse basée sur des règles si la clé est absente.
    """
    p   = _get()
    res = p.analyze_live(req.model_dump())

    from src.detection.llm_reasoner.narrator import narrate
    report = narrate(
        tx_input     = req.model_dump(),
        mars_result  = res,
        accounts_df  = p.accounts_df,
    )
    return NarrativeResponse(**report)


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


# ---------------------------------------------------------------------------
# Génération de données
# ---------------------------------------------------------------------------

class GenerateRequest(BaseModel):
    n_accounts:        int   = 500
    weeks:             int   = 13
    seed:              int   = 42
    fraud_rate:        float = 0.03
    archetype_weights: dict[str, float] | None = None
    fraud_types:       dict[str, float] | None = None
    destination:       str   = "new"   # "new" | "merge"
    dataset_name:      str   = ""


@app.post("/generate/start", tags=["Génération"])
def generate_start(req: GenerateRequest):
    """Lance une génération de données en arrière-plan. Retourne un job_id."""
    job_id = gen_module.start_generation(req.model_dump())
    return {"job_id": job_id}


@app.get("/generate/status/{job_id}", tags=["Génération"])
def generate_status(job_id: str):
    """Sonde l'avancement d'un job de génération."""
    job = gen_module.get_job(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"Job {job_id} introuvable")
    return {
        "id":       job["id"],
        "status":   job["status"],
        "step":     job["step"],
        "progress": job["progress"],
        "log":      job["log"],
        "result":   job["result"],
        "error":    job["error"],
    }


@app.get("/generate/datasets", tags=["Génération"])
def generate_datasets():
    """Liste les datasets disponibles dans data/generated/."""
    return gen_module.list_datasets()


@app.post("/generate/reload", tags=["Génération"])
def generate_reload():
    """Recharge le prédicateur MARS avec le dataset principal mis à jour."""
    global _predictor
    _predictor = FraudPredictor()
    s = _predictor.stats
    return {
        "status": "reloaded",
        "transactions_indexed": s["transactions_indexed"],
        "accounts_indexed":     s["accounts_indexed"],
        "fraud_rate":           s["fraud_rate"],
    }
