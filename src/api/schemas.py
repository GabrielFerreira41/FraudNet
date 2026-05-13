from __future__ import annotations
from pydantic import BaseModel, Field


class AgentScores(BaseModel):
    baseline: float
    sequence: float | None = None
    graph:    float | None = None   # legacy (ancien agent LightGBM)
    g1_device:   float | None = None
    g2_merchant: float | None = None
    g3_temporal: float | None = None


class ScoringResponse(BaseModel):
    transaction_id: str
    score_mars: float
    decision: str           # BLOCK | INVESTIGATE | APPROVE
    agent_scores: AgentScores
    contradiction: bool
    confidence: float
    is_fraud_label: bool | None = None


class HealthResponse(BaseModel):
    status: str
    models: dict[str, bool]
    transactions_indexed: int


class StatsResponse(BaseModel):
    transactions_indexed: int
    accounts_indexed: int
    fraud_rate: float
    features_count: int


class SampleResponse(BaseModel):
    fraud: list[str]
    legitimate: list[str]


# ── Live Analysis ─────────────────────────────────────────────────────────────

class AnalyzeRequest(BaseModel):
    account_id: str | None = Field(None, description="ID du compte (ex: ACC_001)")
    montant: float          = Field(..., gt=0, description="Montant en CAD")
    commercant: str         = Field(..., description="Nom du marchand")
    device: str             = Field("mobile", description="mobile | tablette | desktop")
    timestamp: str | None   = Field(None, description="ISO8601, défaut = maintenant")
    categorie: str | None   = Field(None, description="Catégorie optionnelle")


class AnalyzeAgentScores(BaseModel):
    baseline:    float
    g1_device:   float
    g2_merchant: float
    g3_temporal: float


class AnalyzeResponse(BaseModel):
    decision:        str           # BLOCK | INVESTIGATE | APPROVE
    score_mars:      float
    confidence:      float
    contradiction:   bool
    agent_scores:    AnalyzeAgentScores
    risk_factors:    list[str]
    features:        dict          # valeurs calculées pour debug / affichage
    account_context: dict | None = None


class NarrativeResponse(BaseModel):
    verdict:             str    # FRAUD | SUSPICIOUS | LEGITIMATE
    confidence:          float
    justification:       str
    risk_factors:        list[str]
    fraud_type_suspected: str | None
    recommended_action:  str
    source:              str    # "claude" | "rule_based"
