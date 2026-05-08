from __future__ import annotations
from pydantic import BaseModel


class AgentScores(BaseModel):
    baseline: float
    sequence: float | None   # None si transaction hors cache (live path)
    graph: float


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
