"""
Agent 1 — NormalizationAgent (sync, deterministic).

Cleans and normalizes fields on ExtractionResult, detects clinical context
flags, and returns a NormalizationContext for downstream agents.
"""

from __future__ import annotations

import re
from app.schemas.extraction import ExtractionResult
from app.services.agents import NormalizationContext

# ── route normalization map ──────────────────────────────────────────────────
_ROUTE_MAP = {
    "oral": "PO",
    "by mouth": "PO",
    "po": "PO",
    "subcutaneous": "SubQ",
    "sub-q": "SubQ",
    "subq": "SubQ",
    "subcut": "SubQ",
    "intravenous": "IV",
    "iv": "IV",
    "inhaled": "Inhaled",
    "inhalation": "Inhaled",
    "intramuscular": "IM",
    "im": "IM",
    "topical": "Topical",
    "transdermal": "Transdermal",
    "rectal": "Rectal",
    "ophthalmic": "Ophthalmic",
}

# tags Gemini sometimes leaves on med names
_STATUS_TAG_RE = re.compile(
    r"\s*\((NEW|CHANGED|DISCONTINUED|ON HOLD|CONTINUED|CONTINUING)\)\s*$",
    re.IGNORECASE,
)

# ── dysphagia keywords ──────────────────────────────────────────────────────
_DYSPHAGIA_KW = [
    "dysphagia", "swallowing difficulty", "nectar-thick", "honey-thick",
    "iddsi", "thickened liquid", "pureed diet", "mechanical soft",
    "aspiration precaution", "npo", "nil by mouth",
]

# ── MOLST / DNR keywords ────────────────────────────────────────────────────
_MOLST_KW = ["molst", "dnr", "dni", "dnr/dni", "do not resuscitate",
             "do not intubate", "comfort measures only", "cmo"]

# ── proxy keywords ───────────────────────────────────────────────────────────
_PROXY_KW = [
    "lacks capacity", "healthcare proxy", "legal guardian",
    "power of attorney", "poa", "health care agent",
    "decision-making capacity", "surrogate decision",
]

# ── oxygen keywords ──────────────────────────────────────────────────────────
_OXYGEN_KW = [
    "oxygen", "o2", "nasal cannula", "concentrator", "bipap", "cpap",
    "supplemental o2", "liters per minute", "l/min", "lpm",
]

# ── language detection ───────────────────────────────────────────────────────
_LANG_PATTERNS = [
    (r"primary language[:\s]+(\w+)", 1),
    (r"speaks?\s+(\w+)\s+(?:only|primarily)", 1),
    (r"(spanish|mandarin|cantonese|russian|arabic|haitian creole|portuguese|polish|korean|vietnamese|french)\s+(?:speaking|speaker|primary|language)", 1),
    (r"limited english", None),  # flag but language unknown
    (r"interpreter", None),
]


class NormalizationAgent:
    """Deterministic cleanup and context detection."""

    def run(self, extraction: ExtractionResult) -> tuple[ExtractionResult, NormalizationContext]:
        self._strip_strings(extraction)
        self._normalize_medications(extraction)
        self._deduplicate_medications(extraction)
        self._normalize_allergies(extraction)
        ctx = self._detect_context(extraction)
        return extraction, ctx

    # ── string cleanup ────────────────────────────────────────────────────

    @staticmethod
    def _strip_strings(ext: ExtractionResult) -> None:
        if ext.patient_name:
            ext.patient_name = ext.patient_name.strip()
        if ext.clinical_summary:
            ext.clinical_summary = ext.clinical_summary.strip()

    # ── medication normalization ──────────────────────────────────────────

    @staticmethod
    def _normalize_medications(ext: ExtractionResult) -> None:
        for med in ext.medications:
            # strip status tags from name
            med.name = _STATUS_TAG_RE.sub("", med.name).strip()

            # route normalization
            if med.route:
                med.route = _ROUTE_MAP.get(med.route.strip().lower(), med.route.strip())

            # frequency cleanup
            if med.frequency:
                med.frequency = " ".join(med.frequency.split())

    # ── deduplication ─────────────────────────────────────────────────────

    @staticmethod
    def _deduplicate_medications(ext: ExtractionResult) -> None:
        seen: dict[tuple, int] = {}
        keep: list[int] = []
        for i, med in enumerate(ext.medications):
            key = (med.name.strip().lower(), (med.dose or "").lower(), (med.route or "").lower())
            if key in seen:
                prev_idx = seen[key]
                prev = ext.medications[prev_idx]
                # keep whichever has more non-null fields
                prev_count = sum(1 for v in [prev.dose, prev.frequency, prev.route, prev.purpose, prev.evidence] if v)
                curr_count = sum(1 for v in [med.dose, med.frequency, med.route, med.purpose, med.evidence] if v)
                if curr_count > prev_count:
                    keep.remove(prev_idx)
                    keep.append(i)
                    seen[key] = i
                # else: silently skip the less-complete duplicate
            else:
                seen[key] = i
                keep.append(i)
        ext.medications = [ext.medications[i] for i in keep]

    # ── allergy normalization ─────────────────────────────────────────────

    @staticmethod
    def _normalize_allergies(ext: ExtractionResult) -> None:
        # store normalized names for downstream matching
        # we do NOT mutate the display names
        pass  # downstream agents will call .lower() on each allergy as needed

    # ── context detection ─────────────────────────────────────────────────

    def _detect_context(self, ext: ExtractionResult) -> NormalizationContext:
        ctx = NormalizationContext()

        # build a single searchable corpus from all text fields
        corpus = self._build_corpus(ext)

        # dysphagia
        ctx.has_dysphagia = any(kw in corpus for kw in _DYSPHAGIA_KW)

        # MOLST/DNR
        ctx.has_molst = any(kw in corpus for kw in _MOLST_KW)

        # oxygen
        ctx.has_oxygen = any(kw in corpus for kw in _OXYGEN_KW)

        # proxy / capacity
        ctx.requires_proxy = any(kw in corpus for kw in _PROXY_KW)

        # proxy contact extraction
        if ctx.requires_proxy or ctx.has_molst:
            ctx.proxy_name, ctx.proxy_phone = self._extract_proxy(corpus)

        # language detection
        ctx.language = self._detect_language(corpus)

        return ctx

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
            if med.purpose:
                parts.append(med.purpose)
        for fu in ext.follow_ups:
            if fu.evidence:
                parts.append(fu.evidence)
            if fu.reason:
                parts.append(fu.reason)
        for ws in ext.warning_signs:
            parts.append(ws)
        return "\n".join(parts).lower()

    @staticmethod
    def _detect_language(corpus: str) -> str | None:
        for pattern, group in _LANG_PATTERNS:
            m = re.search(pattern, corpus, re.IGNORECASE)
            if m:
                if group is not None:
                    return m.group(group).capitalize()
                return "Unknown (interpreter required)"
        return None

    @staticmethod
    def _extract_proxy(corpus: str) -> tuple[str | None, str | None]:
        name = None
        phone = None

        # try to find proxy name near keywords
        for kw in ["healthcare proxy", "health care proxy", "legal guardian",
                    "power of attorney", "poa"]:
            pattern = rf"{kw}[:\s,]*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)"
            m = re.search(pattern, corpus, re.IGNORECASE)
            if m:
                name = m.group(1).strip()
                break

        # phone number near proxy mention
        phone_re = re.compile(r"(\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})")
        phones = phone_re.findall(corpus)
        if phones:
            phone = phones[-1]  # last phone is usually the proxy's

        return name, phone
