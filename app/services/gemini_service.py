"""
Gemini extraction service.

Flow:
  1. Local PDF precheck (pdfplumber)  — validates file before sending anything remotely
  2. Send PDF bytes to Gemini 2.0 Flash — structured JSON extraction
  3. Deterministic post-processing     — normalize, clamp, deduplicate
  4. ADK agent clinical review         — reasoning-heavy checks (drug interactions, risk gaps)
"""

import logging
import os
import re
from datetime import datetime
from pathlib import Path

import pdfplumber
from google import genai
from google.genai import types as genai_types
from pydantic import BaseModel, Field

from app.core.config import settings
from app.schemas.extraction import (
    CareTask, ExtractionResult, FollowUpItem,
    MedicationItem, RiskItem,
)

log = logging.getLogger(__name__)

GEMINI_MODEL = "gemini-2.5-flash-lite"
PDF_SIZE_LIMIT_BYTES = 20 * 1024 * 1024  # 20 MB — Gemini inline upload limit

# ---------------------------------------------------------------------------
# Lazy Gemini client
# ---------------------------------------------------------------------------

_client: genai.Client | None = None


def _gemini() -> genai.Client:
    global _client
    if _client is None:
        if not settings.gemini_api_key:
            raise RuntimeError(
                "GEMINI_API_KEY is not set. Add it to your .env file."
            )
        # ADK reads GOOGLE_API_KEY and GOOGLE_GENAI_USE_VERTEXAI from env directly
        os.environ.setdefault("GOOGLE_API_KEY", settings.gemini_api_key)
        os.environ.setdefault("GOOGLE_GENAI_USE_VERTEXAI", "FALSE")
        _client = genai.Client(api_key=settings.gemini_api_key)
    return _client


# ---------------------------------------------------------------------------
# Gemini response schema  (what we instruct Gemini to return)
# ---------------------------------------------------------------------------

class _MedOut(BaseModel):
    name: str
    dose: str | None = None
    frequency: str | None = None
    route: str | None = None
    purpose: str | None = None
    confidence: float = Field(ge=0, le=1, default=0.5)
    evidence: str | None = None


class _FollowUpOut(BaseModel):
    provider_name: str | None = None
    specialty: str | None = None
    appointment_date: str | None = None
    appointment_time: str | None = None
    reason: str | None = None
    confidence: float = Field(ge=0, le=1, default=0.5)
    evidence: str | None = None


class _RiskOut(BaseModel):
    category: str
    severity: str = "medium"
    description: str
    action_needed: str | None = None
    confidence: float = Field(ge=0, le=1, default=0.5)
    evidence: str | None = None


class _CareTaskOut(BaseModel):
    task: str
    category: str
    priority: str = "medium"
    time_frame: str | None = None


class _GeminiOut(BaseModel):
    patient_name: str | None = None
    clinical_summary: str | None = None
    allergies: list[str] = []
    medications: list[_MedOut] = []
    follow_ups: list[_FollowUpOut] = []
    risks: list[_RiskOut] = []
    care_tasks: list[_CareTaskOut] = []
    warning_signs: list[str] = []


# ---------------------------------------------------------------------------
# ADK agent output schema
# ---------------------------------------------------------------------------

class _AgentFinding(BaseModel):
    field_name: str           # e.g. "medication:Warfarin", "risk:fall_risk"
    concern: str
    severity: str = "medium"  # low / medium / high
    suggested_action: str | None = None


class _AgentOut(BaseModel):
    findings: list[_AgentFinding] = []
    # Map of medication name (lowercase) → new confidence to apply (only lowers)
    medication_confidence_adjustments: dict[str, float] = {}
    # Map of risk category (lowercase) → suggested action_needed text
    risk_action_additions: dict[str, str] = {}


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

async def extract_from_pdf(case_id: int, file_path: str) -> ExtractionResult:
    # Step 1: Local PDF precheck
    pdf_meta = _precheck_pdf(file_path)
    log.info(
        "PDF precheck OK — %d pages, %.1f KB",
        pdf_meta["page_count"],
        pdf_meta["file_size_bytes"] / 1024,
    )

    # Step 2: Gemini structured extraction
    gemini_out = await _call_gemini(file_path)

    # Step 3: Deterministic post-processing
    gemini_out = _postprocess(gemini_out)

    # Step 4: ADK agent clinical review
    agent_out = await _run_adk_review(gemini_out)
    gemini_out = _apply_agent_output(gemini_out, agent_out)

    return _to_extraction_result(case_id, gemini_out)


# ---------------------------------------------------------------------------
# Step 1: Local PDF precheck
# ---------------------------------------------------------------------------

_DISCHARGE_KEYWORDS = [
    "discharge", "patient", "medication", "diagnosis",
    "hospital", "physician", "allerg",
]


def _precheck_pdf(file_path: str) -> dict:
    path = Path(file_path)

    if not path.exists():
        raise FileNotFoundError(f"PDF not found: {file_path}")
    if path.suffix.lower() != ".pdf":
        raise ValueError(f"Expected a .pdf file, got: {path.suffix}")

    size = path.stat().st_size
    if size == 0:
        raise ValueError("PDF file is empty")
    if size > PDF_SIZE_LIMIT_BYTES:
        raise ValueError(
            f"PDF is {size / 1024 / 1024:.1f} MB — exceeds 20 MB Gemini inline limit"
        )

    with pdfplumber.open(file_path) as pdf:
        page_count = len(pdf.pages)
        if page_count == 0:
            raise ValueError("PDF has no readable pages")

        sample = ""
        for page in pdf.pages[:3]:
            text = page.extract_text()
            if text:
                sample += text + "\n"

    found = [kw for kw in _DISCHARGE_KEYWORDS if kw in sample.lower()]
    if not found:
        log.warning(
            "No discharge-summary keywords found in %s — proceeding anyway", file_path
        )

    return {
        "page_count": page_count,
        "file_size_bytes": size,
        "keywords_found": found,
    }


# ---------------------------------------------------------------------------
# Step 2: Gemini extraction
# ---------------------------------------------------------------------------

_EXTRACTION_PROMPT = """\
You are a clinical data extractor. Extract all structured information from this hospital \
discharge summary and return strict JSON matching the provided schema.

Rules:
• confidence (0.0–1.0): how certain you are this data appears in the document.
• evidence: a short verbatim quote or section/page reference supporting the item.
• medications: include ALL — discharge meds, existing home meds, PRN, patches, inhalers.
• follow_ups: include ALL appointments, even informal ("see your doctor in 2 weeks").
• risks category: fall_risk | readmission | medication | wound | infection | other
• risks severity: low | medium | high | critical
• care_tasks category: meds | monitoring | follow_up | critical
• care_tasks time_frame: first_24h | 24_to_72h | day_3_to_7
• allergies: list substance names; use [] if document says NKDA or no known allergies.
• Do NOT infer or hallucinate. Only extract what is explicitly stated in the document.
"""


async def _call_gemini(file_path: str) -> _GeminiOut:
    with open(file_path, "rb") as fh:
        pdf_bytes = fh.read()

    pdf_part = genai_types.Part.from_bytes(
        data=pdf_bytes, mime_type="application/pdf"
    )

    response = await _gemini().aio.models.generate_content(
        model=GEMINI_MODEL,
        contents=[pdf_part, _EXTRACTION_PROMPT],
        config=genai_types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=_GeminiOut,
            temperature=0.1,  # low temperature — factual extraction
        ),
    )

    # response.parsed returns the already-validated Pydantic object when response_schema is set
    if response.parsed is not None:
        return response.parsed
    return _GeminiOut.model_validate_json(response.text)


# ---------------------------------------------------------------------------
# Step 3: Deterministic post-processing
# ---------------------------------------------------------------------------

_ROUTE_MAP = {
    "po": "oral", "by mouth": "oral", "orally": "oral", "p.o.": "oral",
    "iv": "intravenous", "intravenously": "intravenous", "i.v.": "intravenous",
    "im": "intramuscular", "i.m.": "intramuscular",
    "sq": "subcutaneous", "sc": "subcutaneous", "subcut": "subcutaneous",
    "sl": "sublingual", "top": "topical", "inh": "inhaled", "neb": "nebulized",
}

_DATE_FORMATS = ("%m/%d/%Y", "%m/%d/%y", "%B %d, %Y", "%b %d, %Y", "%d-%m-%Y")
_VALID_SEVERITIES = {"low", "medium", "high", "critical"}
_VALID_TIMEFRAMES = {"first_24h", "24_to_72h", "day_3_to_7"}
_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _postprocess(out: _GeminiOut) -> _GeminiOut:
    # 1. Clamp all confidence values to [0, 1]
    for m in out.medications:
        m.confidence = _clamp(m.confidence)
    for f in out.follow_ups:
        f.confidence = _clamp(f.confidence)
    for r in out.risks:
        r.confidence = _clamp(r.confidence)

    # 2. Normalize medication routes
    for m in out.medications:
        if m.route:
            m.route = _ROUTE_MAP.get(m.route.lower().strip(), m.route.lower().strip())

    # 3. Normalize appointment dates to YYYY-MM-DD
    for f in out.follow_ups:
        if f.appointment_date and not _DATE_RE.match(f.appointment_date):
            parsed = _try_parse_date(f.appointment_date)
            if parsed:
                f.appointment_date = parsed
            else:
                log.warning(
                    "Could not parse appointment_date %r — clearing", f.appointment_date
                )
                f.appointment_date = None

    # 4. Normalize risk severity
    for r in out.risks:
        low = r.severity.lower()
        r.severity = low if low in _VALID_SEVERITIES else "medium"

    # 5. Normalize care task time_frame
    for t in out.care_tasks:
        if t.time_frame not in _VALID_TIMEFRAMES:
            t.time_frame = "first_24h"

    # 6. Deduplicate medications by name (keep highest-confidence copy)
    seen: dict[str, _MedOut] = {}
    for m in out.medications:
        key = m.name.lower().strip()
        if key not in seen or m.confidence > seen[key].confidence:
            seen[key] = m
    out.medications = list(seen.values())

    return out


def _clamp(v: float) -> float:
    return max(0.0, min(1.0, v))


def _try_parse_date(s: str) -> str | None:
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(s, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return None


# ---------------------------------------------------------------------------
# Step 4: ADK agent — clinical reasoning review
# ---------------------------------------------------------------------------

_ADK_INSTRUCTION = """\
You are a clinical safety reviewer for home-care transitions of elderly patients.
You will receive structured JSON extracted from a hospital discharge summary.

Identify reasoning-heavy concerns that deterministic rules cannot catch:

1. Drug interactions (e.g., opioid + benzodiazepine, warfarin + NSAIDs,
   ACE inhibitor + potassium-sparing diuretic, SSRIs + anticoagulants).
2. Narrow-therapeutic-index medications needing close monitoring:
   warfarin, digoxin, lithium, phenytoin, insulin, methotrexate.
3. Elderly-specific risks: polypharmacy (≥5 meds), anticholinergic burden,
   sedating medications combined with fall risk.
4. High or critical risks that have no action_needed plan.
5. Clinically urgent follow-ups (cardiology, oncology, post-surgical wound)
   with no appointment_date.

For each concern, output a finding with:
  - field_name: e.g. "medication:Warfarin" or "risk:fall_risk"
  - concern: specific clinical description
  - severity: low | medium | high
  - suggested_action: what the nurse should verify or add

medication_confidence_adjustments: medication name (lowercase) → revised confidence
  (only include medications where concern justifies lowering confidence).
risk_action_additions: risk category (lowercase) → suggested action_needed text
  (only for risks that are missing an action plan).

Return empty collections if there are no concerns.
"""


async def _run_adk_review(out: _GeminiOut) -> _AgentOut:
    """Wraps _adk_review so failures never crash the pipeline."""
    try:
        return await _adk_review(out)
    except Exception as exc:
        log.warning(
            "ADK agent review failed (%s: %s) — skipping", type(exc).__name__, exc
        )
        return _AgentOut()


async def _adk_review(out: _GeminiOut) -> _AgentOut:
    from google.adk.agents import LlmAgent
    from google.adk.runners import Runner
    from google.adk.sessions import InMemorySessionService

    session_service = InMemorySessionService()

    agent = LlmAgent(
        name="clinical_reviewer",
        model=GEMINI_MODEL,
        instruction=_ADK_INSTRUCTION,
        output_schema=_AgentOut,
        output_key="review",
    )

    runner = Runner(
        agent=agent,
        app_name="carebridge",
        session_service=session_service,
    )

    session = await session_service.create_session(
        app_name="carebridge",
        user_id="system",
    )

    user_msg = genai_types.Content(
        role="user",
        parts=[genai_types.Part(text=out.model_dump_json(indent=2))],
    )

    async for _ in runner.run_async(
        session_id=session.id,
        user_id="system",
        new_message=user_msg,
    ):
        pass  # consume all events until the agent is done

    final = await session_service.get_session(
        app_name="carebridge",
        user_id="system",
        session_id=session.id,
    )

    review_dict = (final.state or {}).get("review")
    if not review_dict:
        log.warning("ADK agent returned no structured output")
        return _AgentOut()

    return _AgentOut.model_validate(review_dict)


def _apply_agent_output(out: _GeminiOut, agent: _AgentOut) -> _GeminiOut:
    # Lower medication confidence where the agent flagged concerns
    for med in out.medications:
        key = med.name.lower().strip()
        if key in agent.medication_confidence_adjustments:
            new_conf = _clamp(agent.medication_confidence_adjustments[key])
            med.confidence = min(med.confidence, new_conf)  # only lower, never raise
            log.info("ADK: lowered confidence for %s → %.2f", med.name, med.confidence)

    # Fill missing action plans on risks where agent provided suggestions
    for risk in out.risks:
        key = risk.category.lower().strip()
        if key in agent.risk_action_additions and not risk.action_needed:
            risk.action_needed = agent.risk_action_additions[key]
            log.info("ADK: added action plan for risk '%s'", risk.category)

    return out


# ---------------------------------------------------------------------------
# Map internal schema → ExtractionResult
# ---------------------------------------------------------------------------

def _to_extraction_result(case_id: int, out: _GeminiOut) -> ExtractionResult:
    return ExtractionResult(
        case_id=case_id,
        patient_name=out.patient_name,
        clinical_summary=out.clinical_summary,
        allergies=out.allergies,
        medications=[MedicationItem(**m.model_dump()) for m in out.medications],
        follow_ups=[FollowUpItem(**f.model_dump()) for f in out.follow_ups],
        risks=[RiskItem(**r.model_dump()) for r in out.risks],
        care_tasks=[CareTask(**t.model_dump()) for t in out.care_tasks],
        warning_signs=out.warning_signs,
        missing_information=[],  # populated downstream by agent_service.run_agent_checks
        overall_confidence=0.0,  # recomputed downstream by validation_service.validate_and_score
    )
