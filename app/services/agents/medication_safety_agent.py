"""
Agent 2 — MedicationSafetyAgent (sync, deterministic).

Structural medication safety checks.  Drug-drug interaction checks and
narrow-therapeutic-index flagging are already done by the ADK clinical_reviewer
in gemini_service.py — DO NOT duplicate that work here.

Returns list[MissingInfoItem] to be merged into extraction.missing_information.
"""

from __future__ import annotations

import json
import re
from app.schemas.extraction import ExtractionResult, MissingInfoItem, MedicationItem
from app.services.agents import NormalizationContext

# ── allergy class maps ───────────────────────────────────────────────────────
_SULFA_MEDS = [
    "furosemide", "hydrochlorothiazide", "acetazolamide", "celecoxib",
    "sulfamethoxazole", "sulfasalazine", "tmp-smx", "bactrim",
]
_PENICILLIN_MEDS = [
    "amoxicillin", "ampicillin", "piperacillin", "nafcillin",
    "oxacillin", "dicloxacillin", "augmentin",
]
_NSAID_MEDS = [
    "aspirin", "ibuprofen", "naproxen", "ketorolac", "diclofenac",
    "meloxicam", "indomethacin", "celecoxib",
]
_CODEINE_OPIOIDS = [
    "codeine", "hydrocodone", "oxycodone", "morphine", "tramadol",
    "fentanyl", "hydromorphone",
]

# ── do-not-crush / extended-release identifiers ─────────────────────────────
_NO_CRUSH_MEDS = [
    "apixaban", "rivaroxaban", "dabigatran", "tamsulosin", "alendronate",
]
_NO_CRUSH_SUFFIXES = ["xr", "er", "sr", "ec", "extended-release", "enteric-coated"]

# ── APAP names ───────────────────────────────────────────────────────────────
_APAP_PATTERNS = ["apap", "acetaminophen", "paracetamol", "tylenol"]


def _med_name_lower(med: MedicationItem) -> str:
    return med.name.strip().lower()


def _is_active(med: MedicationItem) -> bool:
    """A medication is considered active unless evidence says discontinued."""
    if med.evidence and re.search(r"discontinu|stopped|completed|no longer", med.evidence, re.I):
        return False
    return True


def _contains_any(text: str, patterns: list[str]) -> bool:
    text_lower = text.lower()
    return any(p in text_lower for p in patterns)


class MedicationSafetyAgent:
    """Deterministic structural medication safety checks."""

    def run(
        self,
        extraction: ExtractionResult,
        ctx: NormalizationContext,
    ) -> list[MissingInfoItem]:
        results: list[MissingInfoItem] = []
        active_meds = [m for m in extraction.medications if _is_active(m)]

        self._check_missing_dose(active_meds, results)
        self._check_missing_frequency(active_meds, results)
        self._check_apap_duplication(active_meds, results)
        self._check_allergy_cross_ref(extraction.allergies, active_meds, results)
        self._check_dysphagia_admin(active_meds, ctx, results)
        self._check_dose_availability(extraction.medications, results)
        self._build_change_summary(extraction.medications, results)
        return results

    # ── CHECK 1: missing dose ─────────────────────────────────────────────

    @staticmethod
    def _check_missing_dose(
        meds: list[MedicationItem],
        results: list[MissingInfoItem],
    ) -> None:
        for med in meds:
            if not med.dose or not med.dose.strip():
                results.append(MissingInfoItem(
                    field_name="medications",
                    reason=f"Missing dose for {med.name}",
                    severity="warning",
                ))

    # ── CHECK 2: missing frequency ────────────────────────────────────────

    @staticmethod
    def _check_missing_frequency(
        meds: list[MedicationItem],
        results: list[MissingInfoItem],
    ) -> None:
        for med in meds:
            if not med.frequency or not med.frequency.strip():
                is_prn = False
                # check purpose/evidence for PRN hints
                for field in [med.purpose, med.evidence, med.frequency]:
                    if field and re.search(r"\bprn\b|as needed", field, re.I):
                        is_prn = True
                        break

                if is_prn:
                    results.append(MissingInfoItem(
                        field_name="medications",
                        reason=(
                            f"Missing frequency for {med.name} — "
                            "PRN medication with no maximum daily dose or frequency cap"
                        ),
                        severity="critical",
                    ))
                else:
                    results.append(MissingInfoItem(
                        field_name="medications",
                        reason=f"Missing frequency for {med.name}",
                        severity="warning",
                    ))

    # ── CHECK 3: acetaminophen duplication ────────────────────────────────

    @staticmethod
    def _check_apap_duplication(
        meds: list[MedicationItem],
        results: list[MissingInfoItem],
    ) -> None:
        apap_meds = [m for m in meds if _contains_any(m.name, _APAP_PATTERNS)]
        if len(apap_meds) >= 2:
            names = [m.name for m in apap_meds]
            results.append(MissingInfoItem(
                field_name="medications",
                reason=(
                    f"Acetaminophen duplication: {names[0]} + {names[1]} are both "
                    "prescribed. Combined dose may exceed 4g/day maximum."
                ),
                severity="critical",
            ))

    # ── CHECK 4: allergy cross-reference ──────────────────────────────────

    @staticmethod
    def _check_allergy_cross_ref(
        allergies: list[str],
        meds: list[MedicationItem],
        results: list[MissingInfoItem],
    ) -> None:
        allergy_lower = [a.lower() for a in allergies]

        for allergy in allergy_lower:
            # sulfa / sulfonamide
            if "sulfa" in allergy or "sulfonamide" in allergy:
                for med in meds:
                    if _contains_any(med.name, _SULFA_MEDS):
                        results.append(MissingInfoItem(
                            field_name="medications",
                            reason=(
                                f"Sulfonamide class overlap: patient allergic to "
                                f"{allergy}, {med.name} is a sulfonamide derivative."
                            ),
                            severity="warning",
                        ))

            # penicillin
            if "penicillin" in allergy:
                for med in meds:
                    if _contains_any(med.name, _PENICILLIN_MEDS):
                        results.append(MissingInfoItem(
                            field_name="medications",
                            reason=(
                                f"Penicillin class conflict: patient allergic to "
                                f"penicillin, {med.name} is a penicillin derivative."
                            ),
                            severity="critical",
                        ))

            # aspirin / NSAID
            if "aspirin" in allergy or "nsaid" in allergy:
                for med in meds:
                    if _contains_any(med.name, _NSAID_MEDS):
                        results.append(MissingInfoItem(
                            field_name="medications",
                            reason=(
                                f"NSAID/Aspirin class conflict: patient allergic to "
                                f"{allergy}, {med.name} is in the same class."
                            ),
                            severity="critical",
                        ))

            # codeine / opioid
            if "codeine" in allergy:
                for med in meds:
                    name_lower = _med_name_lower(med)
                    if "codeine" in name_lower:
                        results.append(MissingInfoItem(
                            field_name="medications",
                            reason=(
                                f"Direct allergy conflict: patient allergic to "
                                f"codeine, {med.name} contains codeine."
                            ),
                            severity="critical",
                        ))
                    elif any(op in name_lower for op in _CODEINE_OPIOIDS if op != "codeine"):
                        results.append(MissingInfoItem(
                            field_name="medications",
                            reason=(
                                f"Related opioid warning: patient allergic to codeine, "
                                f"{med.name} is a related opioid. Cross-reactivity possible."
                            ),
                            severity="warning",
                        ))

    # ── CHECK 5: dysphagia administration challenge ───────────────────────

    @staticmethod
    def _check_dysphagia_admin(
        meds: list[MedicationItem],
        ctx: NormalizationContext,
        results: list[MissingInfoItem],
    ) -> None:
        if not ctx.has_dysphagia:
            return

        for med in meds:
            if med.route and med.route.upper() != "PO":
                continue  # not oral, no swallowing concern

            # check if crushing protocol is documented
            has_crush_note = False
            for field in [med.evidence, med.purpose]:
                if field and re.search(r"crush|dissolve|liquid form|suspension", field, re.I):
                    has_crush_note = True
                    break

            if has_crush_note:
                continue

            # check against no-crush list
            name_lower = _med_name_lower(med)
            is_no_crush = any(nc in name_lower for nc in _NO_CRUSH_MEDS)
            if not is_no_crush:
                is_no_crush = any(sfx in name_lower for sfx in _NO_CRUSH_SUFFIXES)

            if is_no_crush:
                results.append(MissingInfoItem(
                    field_name="medications",
                    reason=(
                        f"{med.name} is an oral medication in a patient with documented "
                        "dysphagia. Crushing protocol not addressed in discharge orders."
                    ),
                    severity="critical",
                ))

    # ── CHECK 6: dose availability note ───────────────────────────────────

    @staticmethod
    def _check_dose_availability(
        meds: list[MedicationItem],
        results: list[MissingInfoItem],
    ) -> None:
        availability_kw = ["some pharmacies only stock", "confirm availability",
                           "dose availability", "may not be stocked"]
        for med in meds:
            for field in [med.evidence, med.purpose]:
                if field and any(kw in field.lower() for kw in availability_kw):
                    results.append(MissingInfoItem(
                        field_name="medications",
                        reason=f"{med.name}: dose availability concern noted in discharge",
                        severity="warning",
                    ))
                    break

    # ── CHECK 7: pre-admission medication changes summary ─────────────────

    @staticmethod
    def _build_change_summary(
        meds: list[MedicationItem],
        results: list[MissingInfoItem],
    ) -> None:
        changes = []
        for med in meds:
            # detect status from evidence or purpose fields
            status = None
            for field in [med.evidence, med.purpose]:
                if not field:
                    continue
                fl = field.lower()
                if "new" in fl and "medication" in fl:
                    status = "new"
                elif "changed" in fl or "increased" in fl or "decreased" in fl or "adjusted" in fl:
                    status = "changed"
                elif "discontinu" in fl or "stopped" in fl:
                    status = "discontinued"
            if status:
                changes.append({
                    "medication": med.name,
                    "change": status,
                    "detail": med.evidence or med.purpose or "",
                })

        if changes:
            results.append(MissingInfoItem(
                field_name="medications",
                reason="Pre-admission changes summary",
                severity="info",
            ))
