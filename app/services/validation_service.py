"""
Deterministic validation, confidence scoring, and review payload builder.

Flow:
  ExtractionResult -> normalize -> validate -> score -> NurseReviewPayload
"""

from app.schemas.extraction import ExtractionResult
from app.schemas.review import (
    NurseReviewPayload, ReviewField, FieldStatus, UnresolvedIssue,
)

# Confidence thresholds
THRESHOLD_AUTO = 0.85
THRESHOLD_REVIEW = 0.60

# Penalty weights applied per missing-info item (mirrors ReviewDecisionAgent constants)
_PENALTY_CRITICAL = 0.15
_PENALTY_WARNING = 0.08


def validate_and_score(extraction: ExtractionResult) -> ExtractionResult:
    """Normalize fields, compute base confidence, then apply severity penalties."""
    extraction = _normalize(extraction)
    base = _compute_confidence(extraction)
    # Apply per-item penalties now that we have the real base score.
    # ReviewDecisionAgent already built missing_information; it could not apply
    # penalties earlier because overall_confidence was still 0.0 at that point.
    for item in extraction.missing_information:
        if item.field_name == "_chat_context":
            continue
        if item.severity == "critical":
            base -= _PENALTY_CRITICAL
        elif item.severity in ("warning", "high"):
            base -= _PENALTY_WARNING
    extraction.overall_confidence = round(max(0.0, min(1.0, base)), 3)
    return extraction


def build_review_payload(extraction: ExtractionResult) -> NurseReviewPayload:
    """Build the nurse review payload from extraction data."""
    fields = []
    issues = []

    # Score each section
    fields.append(_score_field("allergies", _allergies_confidence(extraction)))
    fields.append(_score_field("medications", _section_avg_confidence(extraction.medications)))
    fields.append(_score_field("follow_ups", _section_avg_confidence(extraction.follow_ups)))
    fields.append(_score_field("risks", _section_avg_confidence(extraction.risks)))
    fields.append(_score_field("clinical_summary", 0.85 if extraction.clinical_summary else 0.0))

    # Hard blocks become unresolved issues
    for item in extraction.missing_information:
        if item.severity in ("high", "critical"):
            issues.append(UnresolvedIssue(
                field_name=item.field_name,
                issue=item.reason,
                severity=item.severity,
            ))

    # Worst status across all fields determines summary
    worst = _worst_status(fields)
    ready = worst != FieldStatus.blocked and len(issues) == 0

    return NurseReviewPayload(
        case_id=extraction.case_id,
        summary_status=worst,
        extraction=extraction,
        fields=fields,
        unresolved_issues=issues,
        ready_for_approval=ready,
    )


# --- Internal helpers ---

def _normalize(ext: ExtractionResult) -> ExtractionResult:
    """Normalize dates, frequencies, routes to consistent formats."""
    route_map = {"po": "oral", "by mouth": "oral", "iv": "intravenous", "im": "intramuscular"}
    for med in ext.medications:
        if med.route:
            med.route = route_map.get(med.route.lower(), med.route.lower())
    return ext


def _compute_confidence(ext: ExtractionResult) -> float:
    """
    Overall confidence from:
    - Average item confidence (50% weight)
    - Validation pass rate (30% weight) — based on missing info count
    - Evidence quality (20% weight) — items with evidence text
    """
    all_confidences = (
        [m.confidence for m in ext.medications]
        + [f.confidence for f in ext.follow_ups]
        + [r.confidence for r in ext.risks]
    )
    avg_conf = sum(all_confidences) / len(all_confidences) if all_confidences else 0.0

    # Fewer missing items = higher validation score
    total_items = len(ext.medications) + len(ext.follow_ups) + len(ext.risks)
    missing_ratio = len(ext.missing_information) / max(total_items, 1)
    validation_score = max(0.0, 1.0 - missing_ratio)

    # Evidence quality: what fraction of items have evidence text
    items_with_evidence = (
        [m for m in ext.medications if m.evidence]
        + [f for f in ext.follow_ups if f.evidence]
        + [r for r in ext.risks if r.evidence]
    )
    evidence_score = len(items_with_evidence) / max(len(all_confidences), 1)

    return round(0.50 * avg_conf + 0.30 * validation_score + 0.20 * evidence_score, 3)


def _score_field(name: str, confidence: float) -> ReviewField:
    """Map a field's confidence to a status."""
    if confidence >= THRESHOLD_AUTO:
        status = FieldStatus.auto_accepted
    elif confidence >= THRESHOLD_REVIEW:
        status = FieldStatus.needs_review
    else:
        status = FieldStatus.blocked

    issue = None
    if status == FieldStatus.needs_review:
        issue = f"Confidence {confidence:.0%} — nurse review recommended"
    elif status == FieldStatus.blocked:
        issue = f"Confidence {confidence:.0%} — requires manual verification"

    return ReviewField(field_name=name, status=status, confidence=confidence, issue=issue)


def _allergies_confidence(ext: ExtractionResult) -> float:
    """Allergies present = high confidence; missing = hard block."""
    return 0.95 if ext.allergies else 0.0


def _section_avg_confidence(items: list) -> float:
    """Average confidence of a list of extracted items."""
    if not items:
        return 0.0
    return sum(i.confidence for i in items) / len(items)


def _worst_status(fields: list[ReviewField]) -> FieldStatus:
    """Return the worst (most restrictive) status across all fields."""
    if any(f.status == FieldStatus.blocked for f in fields):
        return FieldStatus.blocked
    if any(f.status == FieldStatus.needs_review for f in fields):
        return FieldStatus.needs_review
    return FieldStatus.auto_accepted
