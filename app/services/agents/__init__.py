"""
Agent pipeline for clinical extraction post-processing.

Pipeline order (called from agent_service.run_agent_checks):
  1. NormalizationAgent    — deterministic field cleanup
  2. MedicationSafetyAgent — structural med checks (parallel)
  3. FollowupAndRiskAgent  — follow-up and risk gap checks (parallel)
  4. ReviewDecisionAgent   — confidence scoring + approval blocking
  5. PatientSummaryAgent   — Gemini-powered plain-language summary (called from care plan route, NOT here)
"""

from dataclasses import dataclass, field


@dataclass
class NormalizationContext:
    """Flags detected by NormalizationAgent, passed to downstream agents."""

    has_dysphagia: bool = False
    has_molst: bool = False
    language: str | None = None
    requires_proxy: bool = False
    has_oxygen: bool = False
    proxy_name: str | None = None
    proxy_phone: str | None = None
