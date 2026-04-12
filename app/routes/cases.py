from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.schemas.case import (
    PatientCaseCreate, PatientCaseResponse, PatientCaseSummary, PatientCaseUpdate,
)
from app.services.case_service import create_case, get_all_cases, get_case, update_case

router = APIRouter(prefix="/cases", tags=["cases"])


@router.post("", response_model=PatientCaseResponse, status_code=201)
def create(body: PatientCaseCreate, db: Session = Depends(get_db)):
    """Nurse creates a new intake case."""
    case = create_case(
        db,
        patient_name=body.patient_name,
        patient_email=body.patient_email,
        age=body.age,
        source_hospital=body.source_hospital,
        discharge_date=body.discharge_date,
    )
    return case


@router.get("", response_model=list[PatientCaseSummary])
def list_cases(db: Session = Depends(get_db)):
    """Case list page — returns lightweight summaries."""
    cases = get_all_cases(db)
    summaries = []
    for case in cases:
        extraction = case.extraction_data or {}
        summaries.append(PatientCaseSummary(
            id=case.id,
            patient_name=case.patient_name,
            patient_email=case.patient_email,
            status=case.status,
            risk_score=extraction.get("overall_confidence"),
            missing_items_count=len(extraction.get("missing_information", [])),
            med_conflicts_count=0,
            updated_at=case.updated_at,
        ))
    return summaries


@router.get("/{case_id}", response_model=PatientCaseResponse)
def get(case_id: int, db: Session = Depends(get_db)):
    """Single case detail page."""
    return get_case(db, case_id)


@router.patch("/{case_id}", response_model=PatientCaseResponse)
def update(case_id: int, body: PatientCaseUpdate, db: Session = Depends(get_db)):
    """Update case fields."""
    case = get_case(db, case_id)
    updates = body.model_dump(exclude_unset=True)
    if updates:
        case = update_case(db, case, **updates)
    return case
