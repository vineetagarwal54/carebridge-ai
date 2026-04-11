"""
Internal agent/orchestrator service.
Runs focused checks on Gemini's extraction output.
Not a multi-agent system — just one orchestrator calling check functions.
"""

from app.schemas.extraction import ExtractionResult, MissingInfoItem, RiskItem


async def run_agent_checks(extraction: ExtractionResult) -> ExtractionResult:
    """
    Orchestrator: runs all internal checks on the raw extraction.
    Each check can add missing_information items or adjust confidence.
    """
    extraction = _check_medications(extraction)
    extraction = _check_follow_ups(extraction)
    extraction = _check_allergies(extraction)
    extraction = _check_risks(extraction)
    return extraction


def _check_medications(ext: ExtractionResult) -> ExtractionResult:
    """Flag medications missing critical dosing information."""
    for med in ext.medications:
        if not med.dose or not med.frequency:
            ext.missing_information.append(MissingInfoItem(
                field_name=f"medication:{med.name}",
                reason=f"Missing {'dose' if not med.dose else 'frequency'} for {med.name}",
                severity="high",
            ))
            # Lower confidence for incomplete meds
            med.confidence = min(med.confidence, 0.50)
    return ext


def _check_follow_ups(ext: ExtractionResult) -> ExtractionResult:
    """Flag follow-ups without a date or provider."""
    for fu in ext.follow_ups:
        if not fu.appointment_date:
            ext.missing_information.append(MissingInfoItem(
                field_name=f"follow_up:{fu.provider_name or 'unknown'}",
                reason=f"No appointment date for {fu.specialty or 'unknown'} follow-up",
                severity="high",
            ))
            fu.confidence = min(fu.confidence, 0.45)
        if not fu.provider_name:
            ext.missing_information.append(MissingInfoItem(
                field_name="follow_up:unknown_provider",
                reason="Follow-up scheduled but provider name missing",
                severity="medium",
            ))
    return ext


def _check_allergies(ext: ExtractionResult) -> ExtractionResult:
    """Allergies missing without explicit 'none' is a hard block."""
    if not ext.allergies:
        ext.missing_information.append(MissingInfoItem(
            field_name="allergies",
            reason="No allergies listed and no explicit 'none known' statement",
            severity="high",
        ))
    return ext


def _check_risks(ext: ExtractionResult) -> ExtractionResult:
    """High/critical risks must have an action_needed."""
    for risk in ext.risks:
        if risk.severity in ("high", "critical") and not risk.action_needed:
            ext.missing_information.append(MissingInfoItem(
                field_name=f"risk:{risk.category}",
                reason=f"High-severity risk '{risk.category}' has no action plan",
                severity="high",
            ))
            risk.confidence = min(risk.confidence, 0.50)
    return ext
