"""
Gemini extraction service.
Sends the discharge PDF to Gemini and parses the response into ExtractionResult.
"""

from app.schemas.extraction import (
    ExtractionResult, MedicationItem, FollowUpItem,
    RiskItem, MissingInfoItem, CareTask,
)


async def extract_from_pdf(case_id: int, file_path: str) -> ExtractionResult:
    """
    Send PDF to Gemini for structured extraction.

    TODO: Replace stub with actual Gemini API call.
    The prompt will ask Gemini to return JSON matching our ExtractionResult schema.
    """

    # --- STUB: return realistic fake data for now ---
    return ExtractionResult(
        case_id=case_id,
        patient_name="John Smith",
        clinical_summary="78-year-old male discharged after hip replacement surgery. "
                         "History of hypertension and type 2 diabetes.",
        allergies=["Penicillin", "Sulfa drugs"],
        medications=[
            MedicationItem(
                name="Metformin", dose="500mg", frequency="twice daily",
                route="oral", purpose="diabetes management",
                confidence=0.92, evidence="Discharge meds section, page 2",
            ),
            MedicationItem(
                name="Lisinopril", dose="10mg", frequency="once daily",
                route="oral", purpose="blood pressure control",
                confidence=0.88, evidence="Discharge meds section, page 2",
            ),
            MedicationItem(
                name="Oxycodone", dose="5mg", frequency="every 6 hours as needed",
                route="oral", purpose="post-surgical pain",
                confidence=0.75, evidence="Pain management section, page 3",
            ),
        ],
        follow_ups=[
            FollowUpItem(
                provider_name="Dr. Sarah Chen", specialty="Orthopedics",
                appointment_date="2026-04-25", reason="Post-op follow-up",
                confidence=0.90, evidence="Follow-up section, page 4",
            ),
            FollowUpItem(
                provider_name="Dr. Patel", specialty="Primary Care",
                appointment_date=None, reason="Medication review",
                confidence=0.55, evidence="Mentioned briefly in notes",
            ),
        ],
        risks=[
            RiskItem(
                category="fall_risk", severity="high",
                description="Post hip replacement, elderly patient",
                action_needed="Use walker, remove trip hazards",
                confidence=0.93, evidence="Nursing assessment, page 1",
            ),
        ],
        care_tasks=[
            CareTask(task="Take Metformin 500mg", category="meds",
                     priority="high", time_frame="first_24h"),
            CareTask(task="Monitor surgical wound for infection signs",
                     category="monitoring", priority="high", time_frame="first_24h"),
            CareTask(task="Schedule primary care follow-up",
                     category="follow_up", priority="medium", time_frame="24_to_72h"),
        ],
        warning_signs=[
            "Fever above 101°F",
            "Increased redness or drainage at surgical site",
            "Sudden severe pain in operated hip",
            "Difficulty breathing or chest pain",
        ],
        missing_information=[],
        overall_confidence=0.78,
    )
