"""
Agent 4 — ReviewDecisionAgent (sync, deterministic).

Computes final confidence score with severity-based penalties, determines
approval blocking, and builds chat_context for the coordinator chat route.

Does NOT call validate_and_score() — that still runs after this in the pipeline.
"""

from __future__ import annotations

import re
from app.schemas.extraction import ExtractionResult, MedicationItem, MissingInfoItem
from app.services.agents import NormalizationContext

# ── penalty constants ─────────────────────────────────────────────────────────
_PENALTY_CRITICAL = 0.15
_PENALTY_WARNING = 0.08

# ── high-risk medication categories (for chat context) ────────────────────────
_ANTICOAGULANTS = ["apixaban", "rivaroxaban", "enoxaparin", "warfarin", "dabigatran", "heparin"]
_OPIOIDS = ["oxycodone", "hydrocodone", "morphine", "tramadol", "fentanyl", "hydromorphone", "codeine"]
_INSULIN_KW = ["insulin"]
_COPD_RESCUE_KW = ["albuterol"]


class ReviewDecisionAgent:
    """Final confidence scoring, approval blocking, and chat context assembly."""

    def run(
        self,
        extraction: ExtractionResult,
        ctx: NormalizationContext,
    ) -> ExtractionResult:
        self._apply_confidence_penalties(extraction)
        self._build_chat_context(extraction, ctx)
        return extraction

    # ── confidence penalties ──────────────────────────────────────────────

    @staticmethod
    def _apply_confidence_penalties(ext: ExtractionResult) -> None:
        score = ext.overall_confidence
        for item in ext.missing_information:
            if item.severity == "critical":
                score -= _PENALTY_CRITICAL
            elif item.severity in ("warning", "high"):
                score -= _PENALTY_WARNING
        ext.overall_confidence = round(max(0.0, min(1.0, score)), 3)

    # ── chat context assembly ─────────────────────────────────────────────

    def _build_chat_context(
        self,
        ext: ExtractionResult,
        ctx: NormalizationContext,
    ) -> None:
        """
        Builds chat_context and stores it in the LAST MissingInfoItem as a
        structured info entry.  The review route reads review_data from the
        NurseReviewPayload, which embeds the full ExtractionResult including
        missing_information.  Downstream code (coordinator chat) can find the
        entry with field_name="_chat_context" and severity="info".
        """
        chat_context = {
            "medication_changes": self._medication_changes(ext),
            "allergy_risks": self._allergy_risks(ext),
            "missing_info": self._missing_info_list(ext),
            "key_warnings": self._key_warnings(ext),
            "care_context": self._care_context(ext, ctx),
        }

        import json
        ext.missing_information.append(MissingInfoItem(
            field_name="_chat_context",
            reason=json.dumps(chat_context),
            severity="info",
        ))

    @staticmethod
    def _medication_changes(ext: ExtractionResult) -> list[dict]:
        changes = []
        for med in ext.medications:
            status = None
            for field in [med.evidence, med.purpose]:
                if not field:
                    continue
                fl = field.lower()
                if "new" in fl and ("medication" in fl or "started" in fl or "added" in fl):
                    status = "new"
                elif any(w in fl for w in ["changed", "increased", "decreased", "adjusted", "dose change"]):
                    status = "changed"
                elif any(w in fl for w in ["discontinu", "stopped", "completed"]):
                    status = "discontinued"
            if status:
                changes.append({
                    "medication": med.name,
                    "change": status,
                    "detail": (med.evidence or med.purpose or "")[:200],
                })
        return changes

    @staticmethod
    def _allergy_risks(ext: ExtractionResult) -> list[dict]:
        risks = []
        for item in ext.missing_information:
            if item.field_name == "medications" and any(
                kw in item.reason.lower()
                for kw in ["allergy", "sulfonamide", "penicillin", "nsaid", "codeine"]
            ):
                risks.append({"issue": item.reason, "severity": item.severity})
        return risks

    @staticmethod
    def _missing_info_list(ext: ExtractionResult) -> list[dict]:
        return [
            {"item": item.reason, "severity": item.severity, "field": item.field_name}
            for item in ext.missing_information
            if item.severity != "info" and item.field_name != "_chat_context"
        ]

    @staticmethod
    def _key_warnings(ext: ExtractionResult) -> list[dict]:
        severity_rank = {"critical": 0, "high": 1, "warning": 2, "medium": 3}
        items = [
            item for item in ext.missing_information
            if item.severity in ("critical", "high", "warning")
            and item.field_name != "_chat_context"
        ]
        items.sort(key=lambda x: severity_rank.get(x.severity, 99))
        return [
            {"issue": item.reason, "severity": item.severity}
            for item in items[:5]
        ]

    @staticmethod
    def _care_context(ext: ExtractionResult, ctx: NormalizationContext) -> dict:
        # extract primary diagnosis from clinical summary
        primary_dx = None
        if ext.clinical_summary:
            # first sentence often contains the diagnosis
            first_sentence = ext.clinical_summary.split(".")[0]
            if len(first_sentence) < 200:
                primary_dx = first_sentence.strip()

        # cognitive status detection
        cognitive = None
        if ext.clinical_summary:
            cl = ext.clinical_summary.lower()
            if any(kw in cl for kw in ["dementia", "alzheimer", "cognitive decline", "cognitive impairment"]):
                cognitive = "cognitive impairment noted"

        # high-risk medications
        high_risk = []
        for med in ext.medications:
            name_lower = med.name.lower()
            if any(ac in name_lower for ac in _ANTICOAGULANTS):
                high_risk.append(med.name)
            elif any(op in name_lower for op in _OPIOIDS):
                high_risk.append(med.name)
            elif any(ins in name_lower for ins in _INSULIN_KW):
                high_risk.append(med.name)
            elif ctx.has_oxygen and any(cr in name_lower for cr in _COPD_RESCUE_KW):
                high_risk.append(med.name)

        return {
            "primary_diagnosis": primary_dx,
            "language": ctx.language,
            "cognitive_status": cognitive,
            "molst_dnr": ctx.has_molst,
            "dysphagia": ctx.has_dysphagia,
            "has_oxygen": ctx.has_oxygen,
            "requires_proxy": ctx.requires_proxy,
            "proxy_name": ctx.proxy_name,
            "proxy_phone": ctx.proxy_phone,
            "high_risk_medications": high_risk,
        }
