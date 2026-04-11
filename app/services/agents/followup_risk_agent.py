"""
Agent 3 — FollowupAndRiskAgent (sync, deterministic).

Checks follow-up scheduling gaps, missing documents/equipment/orders,
and contextual flags (MOLST, language barrier, proxy consent, oxygen, wounds).

Returns list[MissingInfoItem] to be merged into extraction.missing_information.
"""

from __future__ import annotations

import re
from app.schemas.extraction import ExtractionResult, MissingInfoItem
from app.services.agents import NormalizationContext

# ── equipment items to look for ──────────────────────────────────────────────
_EQUIPMENT_ITEMS = [
    "nebulizer", "oxygen concentrator", "bipap", "cpap", "walker",
    "wheelchair", "hospital bed", "pulse oximeter", "suction machine",
    "portable oxygen", "dme",
]

# ── keywords signalling unplaced orders ──────────────────────────────────────
_NOT_ORDERED_KW = [
    "not ordered", "not placed", "facility to confirm", "order not placed",
    "not yet ordered", "needs to be ordered", "pending order",
]

# ── missing attachment keywords ──────────────────────────────────────────────
_MISSING_DOC_KW = [
    "not included", "not included in discharge packet",
    "addendum referenced", "see addendum", "referenced but not provided",
    "attached (see", "order attached but not included",
]


class FollowupAndRiskAgent:
    """Follow-up scheduling, equipment, document, and contextual risk checks."""

    def run(
        self,
        extraction: ExtractionResult,
        ctx: NormalizationContext,
    ) -> list[MissingInfoItem]:
        results: list[MissingInfoItem] = []
        corpus = self._build_corpus(extraction)

        self._check_unscheduled_followups(extraction, results)
        self._check_missing_attachments(corpus, results)
        self._check_missing_equipment(corpus, results)
        self._check_oxygen_gaps(corpus, ctx, results)
        self._check_molst(ctx, results)
        self._check_language_barrier(ctx, results)
        self._check_proxy_consent(ctx, results)
        self._check_wound_care(corpus, extraction, results)
        return results

    # ── CHECK 1: unscheduled follow-ups ───────────────────────────────────

    @staticmethod
    def _check_unscheduled_followups(
        ext: ExtractionResult,
        results: list[MissingInfoItem],
    ) -> None:
        for fu in ext.follow_ups:
            is_unscheduled = (
                not fu.appointment_date
                or (fu.evidence and re.search(r"not scheduled|unscheduled", fu.evidence, re.I))
                or (fu.reason and re.search(r"not scheduled|unscheduled", fu.reason, re.I))
            )
            if not is_unscheduled:
                continue

            # determine urgency from timeframe mentions
            timeframe_text = fu.reason or fu.evidence or ""
            is_urgent = bool(re.search(r"\b\d+\s*(day|week)\b", timeframe_text, re.I))
            is_less_urgent = bool(re.search(r"\b\d+\s*(month|weeks)\b", timeframe_text, re.I))
            severity = "critical" if is_urgent else ("warning" if is_less_urgent else "critical")

            provider = fu.provider_name or fu.specialty or "Unknown provider"
            reason_text = f"Follow-up with {provider} not scheduled"
            if timeframe_text:
                reason_text += f" — {timeframe_text.strip()[:120]}"

            results.append(MissingInfoItem(
                field_name=f"follow_up:{provider}",
                reason=reason_text,
                severity=severity,
            ))

        # also flag follow-ups missing provider name (from original checks)
        for fu in ext.follow_ups:
            if not fu.provider_name:
                results.append(MissingInfoItem(
                    field_name="follow_up:unknown_provider",
                    reason="Follow-up scheduled but provider name missing",
                    severity="medium",
                ))

    # ── CHECK 2: missing attachments ──────────────────────────────────────

    @staticmethod
    def _check_missing_attachments(
        corpus: str,
        results: list[MissingInfoItem],
    ) -> None:
        for kw in _MISSING_DOC_KW:
            if kw in corpus:
                # try to extract what's missing
                pattern = rf"(.{{0,60}}){re.escape(kw)}(.{{0,60}})"
                m = re.search(pattern, corpus, re.I)
                context = m.group(0).strip() if m else kw
                results.append(MissingInfoItem(
                    field_name="documents",
                    reason=f"Referenced document missing from discharge packet: {context[:150]}",
                    severity="critical",
                ))
                break  # one flag per extraction is enough

    # ── CHECK 3: missing equipment orders ─────────────────────────────────

    @staticmethod
    def _check_missing_equipment(
        corpus: str,
        results: list[MissingInfoItem],
    ) -> None:
        for item in _EQUIPMENT_ITEMS:
            if item not in corpus:
                continue
            # check if there is a "not ordered" pattern near this item
            pattern = rf"{re.escape(item)}.{{0,80}}({'|'.join(re.escape(k) for k in _NOT_ORDERED_KW)})"
            if re.search(pattern, corpus, re.I):
                is_oxygen = item in ("oxygen concentrator", "portable oxygen", "bipap", "cpap")
                results.append(MissingInfoItem(
                    field_name="equipment",
                    reason=f"Equipment not ordered: {item}",
                    severity="critical" if is_oxygen else "warning",
                ))

    # ── CHECK 4: oxygen specification gaps ────────────────────────────────

    @staticmethod
    def _check_oxygen_gaps(
        corpus: str,
        ctx: NormalizationContext,
        results: list[MissingInfoItem],
    ) -> None:
        if not ctx.has_oxygen:
            return

        # check for missing sleep/nighttime O2 specification
        has_daytime = bool(re.search(r"(rest|daytime|awake|activity)\s*.{0,20}(l/min|lpm|liters)", corpus, re.I))
        has_sleep = bool(re.search(r"(sleep|nighttime|nocturnal|overnight)\s*.{0,20}(l/min|lpm|liters)", corpus, re.I))
        if has_daytime and not has_sleep:
            results.append(MissingInfoItem(
                field_name="oxygen",
                reason="Oxygen flow rate during sleep not specified",
                severity="critical",
            ))

        # check for target SpO2 range
        has_target = bool(re.search(r"(target|maintain|goal)\s*spo2|spo2\s*(target|goal|range|\d+\s*-\s*\d+%)", corpus, re.I))
        if not has_target:
            results.append(MissingInfoItem(
                field_name="oxygen",
                reason="No target SpO2 range documented",
                severity="warning",
            ))

    # ── CHECK 5: MOLST / DNR alerts ──────────────────────────────────────

    @staticmethod
    def _check_molst(
        ctx: NormalizationContext,
        results: list[MissingInfoItem],
    ) -> None:
        if not ctx.has_molst:
            return

        proxy_info = ""
        if ctx.proxy_name:
            proxy_info = f" Contact healthcare proxy {ctx.proxy_name}"
            if ctx.proxy_phone:
                proxy_info += f" ({ctx.proxy_phone})"
            proxy_info += "."

        results.append(MissingInfoItem(
            field_name="advance_directives",
            reason="MOLST/DNR document must accompany patient and be placed in chart",
            severity="critical",
        ))
        results.append(MissingInfoItem(
            field_name="advance_directives",
            reason=(
                "MOLST document requires family review within 72 hours of admission."
                + proxy_info
            ),
            severity="critical",
        ))
        results.append(MissingInfoItem(
            field_name="advance_directives",
            reason="DNR/DNI status — all staff must be informed before any emergency",
            severity="critical",
        ))

    # ── CHECK 6: language / communication barrier ─────────────────────────

    @staticmethod
    def _check_language_barrier(
        ctx: NormalizationContext,
        results: list[MissingInfoItem],
    ) -> None:
        if not ctx.language:
            return

        proxy_note = ""
        if ctx.proxy_name:
            proxy_note = f" Healthcare proxy ({ctx.proxy_name}"
            if ctx.proxy_phone:
                proxy_note += f", {ctx.proxy_phone}"
            proxy_note += ") may assist."

        results.append(MissingInfoItem(
            field_name="communication",
            reason=(
                f"Patient's primary language is {ctx.language}. "
                "All care communication requires certified interpreter or bilingual staff."
            ),
            severity="critical",
        ))

    # ── CHECK 7: cognitive capacity / proxy consent ───────────────────────

    @staticmethod
    def _check_proxy_consent(
        ctx: NormalizationContext,
        results: list[MissingInfoItem],
    ) -> None:
        if not ctx.requires_proxy:
            return

        proxy_contact = ""
        if ctx.proxy_name:
            proxy_contact = f"Contact {ctx.proxy_name}"
            if ctx.proxy_phone:
                proxy_contact += f" at {ctx.proxy_phone}"
            proxy_contact += " for any care decisions."
        else:
            proxy_contact = "Identify and contact healthcare proxy immediately."

        results.append(MissingInfoItem(
            field_name="consent",
            reason=(
                "Patient lacks decision-making capacity. All significant care "
                f"decisions require healthcare proxy consent. {proxy_contact}"
            ),
            severity="critical",
        ))

    # ── CHECK 8: wound care gaps ──────────────────────────────────────────

    @staticmethod
    def _check_wound_care(
        corpus: str,
        ext: ExtractionResult,
        results: list[MissingInfoItem],
    ) -> None:
        wound_kw = ["wound care", "surgical site", "staples", "sutures",
                     "incision", "dressing change", "wound vac"]
        has_wound = any(kw in corpus for kw in wound_kw)
        if not has_wound:
            return

        # check for dressing change frequency
        has_dressing_freq = bool(re.search(
            r"dressing\s+change.{0,30}(daily|every|twice|q\d+h|bid|tid)", corpus, re.I
        ))
        if not has_dressing_freq and "dressing" in corpus:
            results.append(MissingInfoItem(
                field_name="wound_care",
                reason="Wound dressing change frequency not specified in discharge orders",
                severity="warning",
            ))

        # check for staple/suture removal scheduling
        has_removal = "staple" in corpus or "suture" in corpus
        removal_scheduled = bool(re.search(r"(staple|suture)\s+removal.{0,40}(scheduled|appointment|date)", corpus, re.I))
        if has_removal and not removal_scheduled:
            results.append(MissingInfoItem(
                field_name="wound_care",
                reason="Staple/suture removal not scheduled",
                severity="warning",
            ))

    # ── corpus builder ────────────────────────────────────────────────────

    @staticmethod
    def _build_corpus(ext: ExtractionResult) -> str:
        parts = []
        if ext.clinical_summary:
            parts.append(ext.clinical_summary)
        for task in ext.care_tasks:
            parts.append(task.task)
        for item in ext.missing_information:
            parts.append(item.reason)
        for risk in ext.risks:
            parts.append(risk.description)
            if risk.action_needed:
                parts.append(risk.action_needed)
        for med in ext.medications:
            if med.evidence:
                parts.append(med.evidence)
        for fu in ext.follow_ups:
            if fu.evidence:
                parts.append(fu.evidence)
            if fu.reason:
                parts.append(fu.reason)
        for ws in ext.warning_signs:
            parts.append(ws)
        return "\n".join(parts).lower()
