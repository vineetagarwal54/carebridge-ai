"""
Agent orchestrator service.

Runs a 5-agent pipeline on Gemini's raw extraction output:
  1. NormalizationAgent  — field cleanup + context detection
  2. MedicationSafetyAgent  — structural med checks   } run in parallel
  3. FollowupAndRiskAgent   — follow-up / risk checks }
  4. ReviewDecisionAgent — confidence penalties + approval blocking + chat context

Agent 5 (PatientSummaryAgent) is NOT called here — it is invoked by the
care plan generation route to avoid slowing down extraction.

Function signature is unchanged from the original:
  async def run_agent_checks(extraction: ExtractionResult) -> ExtractionResult
"""

import asyncio
from app.schemas.extraction import ExtractionResult, MissingInfoItem
from app.services.agents.normalization_agent import NormalizationAgent
from app.services.agents.medication_safety_agent import MedicationSafetyAgent
from app.services.agents.followup_risk_agent import FollowupAndRiskAgent
from app.services.agents.review_decision_agent import ReviewDecisionAgent


async def run_agent_checks(extraction: ExtractionResult) -> ExtractionResult:
    """
    Orchestrator: runs all agent checks on the raw extraction.

    Pipeline:
      1. Normalize fields and detect clinical context flags
      2. Run medication safety + follow-up/risk checks in parallel
         (agents return findings only — they do NOT mutate extraction)
      3. Merge findings into extraction (main thread, sequential)
      4. Apply confidence caps based on findings (main thread)
      5. Review decision — penalties + chat context
    """

    # Step 1: normalize (sync, main thread)
    extraction, ctx = NormalizationAgent().run(extraction)

    # Step 2: run safety checks in parallel — both return list[MissingInfoItem]
    # Neither agent mutates extraction; they only read it.
    med_findings, risk_findings = await asyncio.gather(
        asyncio.to_thread(MedicationSafetyAgent().run, extraction, ctx),
        asyncio.to_thread(FollowupAndRiskAgent().run, extraction, ctx),
    )

    # Step 3: merge findings (main thread, both futures resolved)
    extraction.missing_information.extend(med_findings)
    extraction.missing_information.extend(risk_findings)

    # Step 4: apply confidence caps based on findings (main thread)
    _apply_confidence_caps(extraction)

    # Step 5: review decision — penalties + chat context
    extraction = ReviewDecisionAgent().run(extraction, ctx)

    return extraction


def _apply_confidence_caps(extraction: ExtractionResult) -> None:
    """
    Cap confidence on medications and follow-ups based on missing-info findings.
    Runs in the main thread after both agents have returned — no race conditions.
    """
    # Build sets of flagged medication and follow-up names from findings
    flagged_meds: set[str] = set()
    flagged_followups: set[str] = set()

    for item in extraction.missing_information:
        reason_lower = item.reason.lower()

        # Medication flags: "Missing dose for X" / "Missing frequency for X"
        if item.field_name == "medications" and (
            "missing dose" in reason_lower or "missing frequency" in reason_lower
        ):
            # extract med name from reason text
            for med in extraction.medications:
                if med.name.lower() in reason_lower:
                    flagged_meds.add(med.name.lower())

        # Follow-up flags from field_name pattern "follow_up:ProviderName"
        if item.field_name.startswith("follow_up:") and item.severity in ("critical", "warning"):
            provider = item.field_name.split(":", 1)[1].lower()
            flagged_followups.add(provider)

    # Apply caps
    for med in extraction.medications:
        if med.name.lower() in flagged_meds:
            med.confidence = min(med.confidence, 0.50)

    for fu in extraction.follow_ups:
        provider_key = (fu.provider_name or fu.specialty or "unknown provider").lower()
        if provider_key in flagged_followups:
            fu.confidence = min(fu.confidence, 0.45)
