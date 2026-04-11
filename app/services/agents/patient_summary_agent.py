"""
Agent 5 — PatientSummaryAgent (async — makes a Gemini call).

Generates patient-friendly plain-language summary from extraction data.
Called from the care plan generation route, NOT from run_agent_checks().
"""

from __future__ import annotations

import asyncio
import json
import logging
from app.schemas.extraction import ExtractionResult

log = logging.getLogger(__name__)


def _format_meds(meds: list) -> str:
    lines = []
    for m in meds:
        line = f"- {m.name}: {m.dose or 'dose TBD'}, {m.frequency or 'frequency TBD'}"
        if m.route:
            line += f" ({m.route})"
        if m.purpose:
            line += f" — {m.purpose}"
        lines.append(line)
    return "\n".join(lines) if lines else "No medications listed."


def _format_followups(fus: list) -> str:
    lines = []
    for f in fus:
        provider = f.provider_name or "TBD"
        date = f.appointment_date or "NOT SCHEDULED"
        reason = f.reason or ""
        lines.append(f"- {provider} ({f.specialty or 'N/A'}): {date} — {reason}")
    return "\n".join(lines) if lines else "No follow-ups listed."


def _format_issues(items: list) -> str:
    lines = []
    for item in items:
        if item.severity in ("critical", "high", "warning") and item.field_name != "_chat_context":
            lines.append(f"- [{item.severity.upper()}] {item.reason}")
    return "\n".join(lines[:10]) if lines else "No issues found."


class PatientSummaryAgent:
    """Gemini-powered plain-language patient summary generator."""

    async def run(self, extraction: ExtractionResult, case) -> dict:
        """
        Generate patient-friendly summary.  Uses the same Gemini singleton
        from gemini_service.py — do NOT create a second client.

        Args:
            extraction: The full ExtractionResult
            case: The PatientCase ORM object (for discharge_date)

        Returns:
            dict matching the patient_summary structure for care_plan_data
        """
        # lazy import to avoid circular dependency at module load time
        from app.services.gemini_service import _gemini, GEMINI_MODEL
        from google.genai import types as genai_types

        client = _gemini()

        discharge_date = ""
        if case.discharge_date:
            discharge_date = str(case.discharge_date)

        prompt = f"""You are a medical plain-language translator for elderly patients.

Convert this discharge information into patient-friendly content.
Write at a 6th grade reading level. No medical jargon without immediate plain explanation.
Be warm and reassuring. Never diagnose or contradict any discharge instruction.

Patient: {extraction.patient_name or 'Unknown'}
Hospital: {extraction.clinical_summary.split('.')[0] if extraction.clinical_summary else 'Unknown'}
Discharge date: {discharge_date}

Medications to explain:
{_format_meds(extraction.medications)}

Follow-up appointments:
{_format_followups(extraction.follow_ups)}

Issues found during review (use to generate doctor questions):
{_format_issues(extraction.missing_information)}

Return ONLY valid JSON with no markdown, no explanation, matching this exact structure:
{{
  "what_happened": "2-3 sentence plain explanation of why admitted and how they are now",
  "status_items": [
    {{
      "level": "normal",
      "title": "short 4-6 word label",
      "plain_explanation": "1-2 sentences plain language"
    }}
  ],
  "medication_summary": [
    {{
      "name": "generic drug name",
      "purpose_plain": "what it does in plain language",
      "dose": "dose as written",
      "frequency": "frequency as written",
      "change_type": "new|changed|continuing|stopped"
    }}
  ],
  "doctor_questions": [
    "Question 1 — specific to missing information found in this patient's discharge",
    "Question 2",
    "Question 3"
  ],
  "follow_up_summary": [
    {{
      "type": "type of appointment",
      "doctor": "doctor name or null",
      "timeframe": "timeframe string",
      "scheduled": true,
      "phone": "phone number or null"
    }}
  ]
}}

Rules for status_items:
- level "normal" for things that are stable and just need to be maintained
- level "attention" for things that need monitoring (new medications, weight checks)
- level "critical" for things that need immediate action (missing appointments, missing orders)

Rules for doctor_questions:
- Generate EXACTLY 3 questions
- Base them on the ACTUAL issues in this patient's record
- Write them as the patient speaking to their doctor in plain language
- Make them specific, not generic"""

        try:
            response = await asyncio.to_thread(
                client.models.generate_content,
                model=GEMINI_MODEL,
                contents=prompt,
                config=genai_types.GenerateContentConfig(
                    temperature=0.3,
                    response_mime_type="application/json",
                ),
            )

            raw = response.text.strip()
            # strip markdown fences if Gemini wraps them
            if raw.startswith("```"):
                raw = raw.split("```")[1]
                if raw.startswith("json"):
                    raw = raw[4:]

            return json.loads(raw)

        except Exception as exc:
            log.warning("PatientSummaryAgent Gemini call failed: %s", exc)
            return {
                "what_happened": (
                    f"Patient was admitted to the hospital"
                    f"{f' on {discharge_date}' if discharge_date else ''}. "
                    "Please review the care plan details with your care team."
                ),
                "status_items": [],
                "medication_summary": [],
                "doctor_questions": [
                    "Can you explain the main reason I was in the hospital?",
                    "Which medications are new and what are they for?",
                    "When do I need to come back for a follow-up appointment?",
                ],
                "follow_up_summary": [],
            }
