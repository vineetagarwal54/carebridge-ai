# CareBridge AI - Backend

Care transition backend for elderly discharge patients. A nurse or facility user uploads discharge documents, the system extracts and organizes patient case information using AI, the nurse reviews and edits the extracted details, and then the case moves forward in the workflow.

**Tech stack:** Python 3.11+, FastAPI, SQLAlchemy, PostgreSQL, Alembic, Docker

---

## Prerequisites

Make sure you have these installed before starting:

- **Python 3.11+** - [Download](https://www.python.org/downloads/)
- **Docker Desktop** - [Download](https://www.docker.com/products/docker-desktop/) (used for PostgreSQL and pgAdmin)
- **Git** - [Download](https://git-scm.com/downloads)

---

## Setup (step by step)

### 1. Clone the repo

```bash
git clone <your-repo-url>
cd carebridge-ai
```

### 2. Create a virtual environment

```bash
python -m venv .venv
```

Activate it:

- **Windows (PowerShell):**
  ```powershell
  .venv\Scripts\Activate.ps1
  ```
- **Windows (CMD):**
  ```cmd
  .venv\Scripts\activate.bat
  ```
- **macOS / Linux:**
  ```bash
  source .venv/bin/activate
  ```

You should see `(.venv)` at the beginning of your terminal prompt.

### 3. Install dependencies

```bash
pip install -r requirements.txt
```

### 4. Set up environment variables

Copy the example env file and adjust if needed:

```bash
cp .env.example .env
```

The defaults work out of the box for local development. Open `.env` and change `PGADMIN_DEFAULT_EMAIL` to your email if you want to use pgAdmin.

> **Important:** `.env` is in `.gitignore` and will not be committed. Every team member must create their own.

### 5. Start PostgreSQL and pgAdmin

Make sure Docker Desktop is running, then:

```bash
docker compose up -d
```

This starts two containers:

| Service   | Container           | Port  |
|-----------|---------------------|-------|
| PostgreSQL| `carebridge_db`     | 5432  |
| pgAdmin   | `carebridge_pgadmin`| 5050  |

Verify they are running:

```bash
docker compose ps
```

You should see both containers with status `Up`.

### 6. Run database migrations

```bash
alembic upgrade head
```

This creates the `patient_cases` and `documents` tables in PostgreSQL.

### 7. Start the development server

```bash
uvicorn app.main:app --reload
```

The API is now running at **http://localhost:8000**.

Open **http://localhost:8000/docs** in your browser to see the interactive Swagger UI.

---

## Testing the API

Below are curl commands to walk through the full workflow. You can also use the Swagger UI at `/docs` to run these interactively.

### Health check

```bash
curl http://localhost:8000/health
```

Expected: `{"status":"ok"}`

### Step 1 - Create a patient case

```bash
curl -X POST http://localhost:8000/cases \
  -H "Content-Type: application/json" \
  -d '{
    "patient_name": "John Smith",
    "age": 78,
    "source_hospital": "City General Hospital",
    "discharge_date": "2026-04-10"
  }'
```

Note the `id` in the response (e.g. `1`). Use it in the following steps.

### Step 2 - Upload a discharge document

```bash
curl -X POST http://localhost:8000/cases/1/documents \
  -F "file=@/path/to/your/discharge.pdf"
```

Replace `/path/to/your/discharge.pdf` with an actual PDF file path. Any PDF works for now since extraction is still stubbed.

### Step 3 - Run extraction pipeline

```bash
curl -X POST http://localhost:8000/cases/1/extract
```

This runs the Gemini extraction (currently returns stub data), agent checks, and validation scoring. The case status changes to `extracted`.

### Step 4 - Get the nurse review payload

```bash
curl http://localhost:8000/cases/1/review
```

Returns the extraction data with field-level confidence scores and review statuses. The case status changes to `in_review`.

### Step 5 - Nurse edits the review (optional)

```bash
curl -X PATCH http://localhost:8000/cases/1/review \
  -H "Content-Type: application/json" \
  -d '{
    "allergies": ["Penicillin", "Sulfa drugs", "Latex"],
    "nurse_notes": "Confirmed allergies with patient family"
  }'
```

### Step 6 - Approve the case

```bash
curl -X POST http://localhost:8000/cases/1/approve
```

> Note: This will return a 400 error if there are unresolved issues. The stub extraction data has a follow-up with low confidence that causes a block. This is expected behavior -- in production, the nurse would resolve those issues in step 5 first.

### Step 7 - Generate care plan

```bash
curl -X POST http://localhost:8000/cases/1/care-plan/generate
```

> Only works after the case is approved (status = `approved`).

### Step 8 - Get the care plan

```bash
curl http://localhost:8000/cases/1/care-plan
```

### Other useful endpoints

```bash
# List all cases
curl http://localhost:8000/cases

# Get a single case
curl http://localhost:8000/cases/1

# Update case fields
curl -X PATCH http://localhost:8000/cases/1 \
  -H "Content-Type: application/json" \
  -d '{"source_hospital": "New Hospital Name"}'
```

---

## Accessing pgAdmin (optional)

1. Go to **http://localhost:5050**
2. Log in with the email and password from your `.env` file
3. Add a new server with these connection details:
   - **Host:** `db` (the Docker service name, not `localhost`)
   - **Port:** `5432`
   - **Username:** `carebridge_user`
   - **Password:** `carebridge_pass`
   - **Database:** `carebridge_db`

---

## Project structure

```
carebridge-ai/
├── app/
│   ├── main.py                  # FastAPI app and router setup
│   ├── core/
│   │   └── config.py            # Pydantic settings (reads .env)
│   ├── db/
│   │   ├── database.py          # SQLAlchemy engine, session, Base
│   │   └── models/
│   │       ├── patient_case.py  # PatientCase ORM model
│   │       └── document.py      # Document ORM model
│   ├── routes/
│   │   ├── cases.py             # CRUD for patient cases
│   │   ├── documents.py         # File upload
│   │   ├── extraction.py        # AI extraction pipeline
│   │   ├── review.py            # Nurse review workflow
│   │   └── care_plan.py         # Care plan generation
│   ├── schemas/
│   │   ├── case.py              # Request/response schemas for cases
│   │   ├── extraction.py        # Extraction result schema
│   │   ├── review.py            # Review payload schemas
│   │   └── care_plan.py         # Care plan schemas
│   └── services/
│       ├── case_service.py      # Case DB operations
│       ├── gemini_service.py    # PDF extraction (stub)
│       ├── agent_service.py     # Validation agent checks
│       ├── validation_service.py# Scoring and review builder
│       └── care_plan_service.py # Care plan generation
├── alembic/                     # Database migrations
│   ├── env.py
│   └── versions/
├── uploads/                     # Uploaded PDF files (gitignored)
├── compose.yaml                 # Docker Compose for Postgres + pgAdmin
├── requirements.txt             # Python dependencies
├── alembic.ini                  # Alembic config
├── .env.example                 # Template for environment variables
└── .env                         # Local env vars (not committed)
```

---

## Common issues

**`docker compose up` fails:**
Make sure Docker Desktop is running. On Windows, restart Docker Desktop if it was just installed.

**`alembic upgrade head` connection refused:**
PostgreSQL needs a few seconds to start. Wait and try again. Check `docker compose ps` to verify the `carebridge_db` container is up.

**`ModuleNotFoundError: No module named 'app'`:**
Make sure you are running commands from the `carebridge-ai/` root directory, and your virtual environment is activated.

**Port 5432 already in use:**
Another PostgreSQL instance is running locally. Either stop it or change `POSTGRES_PORT` in `.env` and update the port in `DATABASE_URL` to match.

---

## Stopping the services

```bash
# Stop containers (keeps data)
docker compose down

# Stop containers and delete database data
docker compose down -v
```
