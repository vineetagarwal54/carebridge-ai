from pydantic import BaseModel, Field


# Individual extracted items — each has confidence + evidence so we can
# trace back why the model extracted it and how sure it was

class MedicationItem(BaseModel):
    name: str
    dose: str | None = None
    frequency: str | None = None
    route: str | None = None
    purpose: str | None = None
    confidence: float = Field(ge=0, le=1, default=0.0)
    evidence: str | None = None  # snippet from PDF that supports this


class FollowUpItem(BaseModel):
    provider_name: str | None = None
    specialty: str | None = None
    appointment_date: str | None = None
    appointment_time: str | None = None
    reason: str | None = None
    confidence: float = Field(ge=0, le=1, default=0.0)
    evidence: str | None = None


class RiskItem(BaseModel):
    category: str  # e.g. "fall_risk", "readmission", "medication"
    severity: str = "medium"  # low / medium / high / critical
    description: str
    action_needed: str | None = None
    confidence: float = Field(ge=0, le=1, default=0.0)
    evidence: str | None = None


class MissingInfoItem(BaseModel):
    field_name: str
    reason: str
    severity: str = "medium"  # low / medium / high


class CareTask(BaseModel):
    task: str
    category: str  # meds, monitoring, follow_up, critical
    priority: str = "medium"
    time_frame: str | None = None  # e.g. "first_24h", "24_to_72h", "day_3_to_7"


# The full extraction result — this is what Gemini + agent pipeline produces
class ExtractionResult(BaseModel):
    case_id: int
    patient_name: str | None = None
    clinical_summary: str | None = None
    allergies: list[str] = []
    medications: list[MedicationItem] = []
    follow_ups: list[FollowUpItem] = []
    risks: list[RiskItem] = []
    care_tasks: list[CareTask] = []
    warning_signs: list[str] = []
    missing_information: list[MissingInfoItem] = []
    overall_confidence: float = Field(ge=0, le=1, default=0.0)
