"""
Pydantic Response Schemas — API kontrat validasyonu.
Tüm endpoint'ler için type-safe response modelleri.
"""
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


# ─────────────────────────────────────────────
# Machine Health
# ─────────────────────────────────────────────
class MachineHealth(BaseModel):
    machine: str
    health_score: float = Field(ge=0, le=100)
    status: str  # critical | warning | good
    avg_oee: float
    avg_A: float
    total_pieces: int
    alarm_count: int
    stop_hours: float


# ─────────────────────────────────────────────
# RCA Problem
# ─────────────────────────────────────────────
class StatisticalDetails(BaseModel):
    sample_size: Optional[int] = None
    concentration: Optional[float] = None
    wilson_ci_95: Optional[List[float]] = None
    operator_share: Optional[float] = None


class RCAProblem(BaseModel):
    id: int
    title: str
    machine: str
    severity: str
    confidence: float = Field(ge=0, le=1)
    impact_area: str
    impact_score: float = Field(ge=0, le=1)
    evidence: str
    root_cause: str
    solution: str
    confidence_method: Optional[str] = None
    confidence_evidence: Optional[str] = None
    sample_size: Optional[int] = None
    evidence_items: List[str] = []
    recommended_whatif_scenarios: List[str] = []
    statistical_details: Optional[Dict[str, Any]] = None


# ─────────────────────────────────────────────
# What-If Scenario
# ─────────────────────────────────────────────
class OEEValues(BaseModel):
    A: float
    P: float
    Q: float
    OEE: float


class WhatIfResult(BaseModel):
    machine: str
    day: str
    before: OEEValues
    after: OEEValues
    delta_oee: float
    delta_A: Optional[float] = None
    delta_P: Optional[float] = None
    delta_Q: Optional[float] = None
    recovered_hours: Optional[float] = None
    scenario: str


# ─────────────────────────────────────────────
# Financial Impact
# ─────────────────────────────────────────────
class FinancialImpact(BaseModel):
    delta_oee: float
    recovered_hours_per_day: float
    extra_pieces_per_day: float
    gross_benefit_per_day: float
    downtime_saving_per_day: float
    net_benefit_per_day: float
    payback_days: float
    assumptions: Dict[str, float]


# ─────────────────────────────────────────────
# Agent Pipeline Step
# ─────────────────────────────────────────────
class AgentStep(BaseModel):
    agent: str
    status: str
    result: Dict[str, Any]


class AgentPipelineResponse(BaseModel):
    target_machine: str
    pipeline: List[AgentStep]
    final_report: str
    summary: Dict[str, Any]
    critic_review: Optional[Dict[str, Any]] = None


# ─────────────────────────────────────────────
# Predictive Maintenance
# ─────────────────────────────────────────────
class PredictiveMetrics(BaseModel):
    auc_roc: float
    precision: float
    recall: float
    f1: float


class CycleFailureModel(BaseModel):
    status: str
    machine: str
    model_type: Optional[str] = None
    train_samples: Optional[int] = None
    test_samples: Optional[int] = None
    positives: Optional[int] = None
    negatives: Optional[int] = None
    metrics: Optional[PredictiveMetrics] = None
    feature_importance: Optional[List[Any]] = None
    current_risk_score: Optional[float] = None
    risk_level: Optional[str] = None
    interpretation: Optional[str] = None


# ─────────────────────────────────────────────
# Generic Error
# ─────────────────────────────────────────────
class APIError(BaseModel):
    error: str
    function: Optional[str] = None
    status_code: int = 500
