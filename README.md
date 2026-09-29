# Smart Health & Supply Chain Resilience MVP
> **Build with AI: Code for Communities (2nd Edition) — Track 3: Resilience (BRICS Theme)**  
> *A decentralized, privacy-preserving public healthcare network platform providing real-time inventory visibility, predictive stockout early warnings, and intra-district resource redistribution powered by Google Gemini Flash.*

[![Python 3.13](https://img.shields.io/badge/Python-3.13-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688.svg)](https://fastapi.tiangolo.com)
[![Google Gemini API](https://img.shields.io/badge/Google%20Gemini-gemini--flash--latest-8E75C2.svg)](https://ai.google.dev/)
[![Firebase](https://img.shields.io/badge/Firebase-Firestore%20%26%20Hosting-FFA611.svg)](https://firebase.google.com/)
[![Google Cloud Run](https://img.shields.io/badge/Google%20Cloud-Cloud%20Run-4285F4.svg)](https://cloud.google.com/run)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

---

## 1. Problem Statement
Public primary healthcare networks (Primary Health Centres, or PHCs) operate on thin margins of essential medicine inventory, staff attendance, and bed capacity. In critical regions—such as the Pimpri-Chinchwad municipal corridor and rural regional partner nodes—frontline health officers lack unified, real-time cross-facility visibility. 

When consumption spikes unexpectedly due to seasonal epidemics, trauma surges, or supply disruptions:
- **Undetected Stockouts**: Medicine depletion is discovered only after emergency stock reaches zero.
- **Siloed Resources**: Nearby health centres in the same district often maintain surplus inventory of the identical medicine, yet no automated mechanism flags or coordinates lateral rebalancing.
- **Delayed Intervention**: Centralized procurement cycles require days to weeks, whereas inter-facility transfers can resolve clinical deficits within hours.

---

## 2. Solution Overview
The **Smart Health & Supply Chain Resilience Platform** provides an end-to-end operational nerve centre:
1. **Real-Time Network Telemetry**: Continuous monitoring across 8 PHCs and 12 essential medicines (WHO-aligned), tracking stock runways (`days_left = current_qty / avg_daily_consumption`), footfall, bed occupancy, and staff presence.
2. **Predictive Stockout Forecasting**: Automatically tags any supply runway under 5 days as `at_risk: true` and categorizes facility status (`green` > 10d, `amber` 5–10d, `red` < 5d).
3. **Autonomous Gemini Flash Redistribution Engine**: When a stockout risk is detected, the engine scans peer health centres within the same district for surplus capacity. It formats real inventory telemetry into a targeted prompt and queries `gemini-flash-latest` to generate concise, human-readable 2–3 line transfer directives with specific quantities and operational rationale.
4. **Interactive Crisis Simulation**: A one-click live demo feature (`POST /simulate-crisis/{phc_id}/{medicine_id}`) that instantly drops a facility's healthiest medicine to 2 units, triggers the forecast-and-alert pipeline, and broadcasts the live Gemini recommendation.
5. **Universal Lightweight UI**: Zero-bundle vanilla JavaScript + Tailwind CSS CDN + Chart.js CDN dashboard that renders instantly on both desktop command centres and mobile smartphones used by field health officers.

---

## 3. Architecture & Data Flow

```mermaid
flowchart TD
    subgraph Frontend["Client Layer (Vanilla JS + Tailwind + Chart.js)"]
        UI["Operations Bulletin Dashboard (index.html)"]
        HeroMap["Hero Network Resilience Map (Interactive SVG with Transfer Arcs)"]
        Ledger["Health Centre Operational Ledger & Manifest"]
        DetailModal["Facility Detail Modal: 21-Day Trends & Inventory Runway"]
        CrisisBtn["Interactive 'Simulate Crisis' Trigger Button"]
        WireFeed["Operations Dispatch Wire Feed (Gemini Flash Alerts)"]
    end

    subgraph Backend["Backend Layer (FastAPI on Google Cloud Run)"]
        Router["FastAPI Application (main.py)"]
        ForecastEngine["Runway Calculator (days_left < 5)"]
        SurplusMatcher["Intra-District Surplus Matcher"]
        CrisisHandler["POST /simulate-crisis Controller"]
    end

    subgraph AI["Cognitive Layer (Google Gemini API)"]
        GeminiClient["google-genai Client (gemini-flash-latest)"]
        PromptEngine["District Health Officer Ops Prompt"]
    end

    subgraph Data["Persistence Layer"]
        DB["Universal Database Abstraction (database.py)"]
        Firestore[("Firebase Cloud Firestore / Resilient State Engine")]
        Collections["phcs | medicines | stock | footfall | staff_attendance | alerts"]
    end

    UI -->|GET /phcs & /alerts| Router
    Grid -->|Click Inspect| DetailModal
    DetailModal -->|GET /stock/{id} & /phc/{id}/history| Router
    CrisisBtn -->|POST /simulate-crisis/{phc}/{med}| CrisisHandler
    CrisisHandler --> ForecastEngine
    ForecastEngine --> SurplusMatcher
    SurplusMatcher -->|Target deficit + Peer surplus| PromptEngine
    PromptEngine --> GeminiClient
    GeminiClient -->|2-3 line operational directive| SurplusMatcher
    Router --> DB
    DB --> Firestore
    Firestore --> Collections
```

---

## 4. BRICS Interoperability & Sovereign Cooperation

> ### **Architectural Principle: Federated Signals Without Raw Data Exposure**
> In accordance with the BRICS Track 3 Resilience theme, this platform is architected for cross-border and inter-district cooperation without compromising institutional or national data sovereignty:
> - **Autonomous Local Nodes**: Each participating sovereign municipality, state, or nation-state (e.g., *Pimpri-Chinchwad* and regional partner *Nation B*) deploys and manages its own independent instance of this schema and FastAPI service.
> - **No Raw Patient Data Sharing**: Individual patient clinical records, doctor consultations, and confidential procurement ledgers never leave the host jurisdiction's boundaries.
> - **Standardized Predictive Signal Exchange**: Facilities communicate exclusively via a shared, open API contract emitting aggregated stockout risk flags (`days_left < 5`) and anonymized surplus availability indicators (`surplus_qty > 10d`).
> - **Decentralized Mutual Aid**: Peer districts can coordinate cross-boundary early warning alerts and lateral humanitarian supply rebalancing without creating a centralized database or violating data-residency laws.

---

## 5. Design System & Visual Language (Phase 2 Overhaul)

Departing from generic SaaS conventions, the Phase 2 interface is engineered as an **official public health operations bulletin**:

### Palette Tokens (Defined as CSS Variables)
- `--paper` (`#EEF1EC`): Cool, pale, paper-like background.
- `--ink` (`#1C2B29`): Deep teal-charcoal primary text (contrast > 12:1 on paper).
- `--teal` (`#0F6E63`): Primary accent & optimal-resilient status indicator.
- `--vermillion` (`#A6362A`): Muted brick-red critical status indicator.
- `--turmeric` (`#8A6508` / `#B8860B`): Ochre low-stock warning indicator (strictly tuned for WCAG AA text contrast).
- `--line` (`#C9C2B4`): Muted warm grey borders and ledger dividers.

### Typography & Editorial Standards
- **Headlines / Masthead**: **Fraunces** — high-character serif establishing official bulletin hierarchy.
- **Body & Data**: **Public Sans** — U.S. Web Design System typeface for accessible public-sector infrastructure.
- **Tabular Lining Figures**: `font-variant-numeric: tabular-nums` applied across all inventory counts, patient footfall figures, and days-left runways.
- **Sentence-Case Formatting**: Zero all-caps shouting; all labels, status pills, and dispatches formatted in clean sentence case.
- **Stacked Metadata**: Eliminated middot (`•`) chains in favor of clean label-value definitions.

### Hero Network Resilience Map & Motion
- **Geographic SVG Schematic**: Plots all 8 primary health centres across two distinct administrative clusters (*District 1: Pimpri-Chinchwad* and *District 2: Nation B*).
- **Interactive Node States**: Dynamic node sizing and color mapping reflecting live stock risk tiers.
- **The One Motion Investment**: When a crisis is simulated or an active alert recommends lateral rebalancing, the map renders an **animated redistribution corridor** (dashed vector arc with directional flow) connecting the donor facility to the recipient facility. Automatically degrades gracefully under `prefers-reduced-motion`.

---

## 6. Technology Stack

| Layer | Component | Specification |
|---|---|---|
| **Backend** | Python & FastAPI | Python 3.13, FastAPI 0.115, Uvicorn 0.30, Pydantic v2 |
| **Artificial Intelligence** | Google Gemini API | Model alias: `gemini-flash-latest` via official `google-genai` SDK |
| **Database** | Firebase Firestore | `firebase-admin` with automatic resilient local storage fallback |
| **Frontend** | Vanilla Web Tech | HTML5, vanilla ES6+ JS, Tailwind CSS (CDN), Chart.js (CDN), Lucide Icons |
| **Backend Hosting** | Google Cloud Run | Fully containerized with production multi-stage `Dockerfile` |
| **Frontend Hosting** | Firebase Hosting | Static CDN hosting via `firebase.json` with Cloud Run rewrites |
| **Testing** | Pytest | Complete test suite covering health, forecasts, stockouts, and crisis simulation |

---

## 7. Data Model (Firestore Collections)

1. `phcs`:
   - `id`: Unique string (e.g. `phc_kiwale`, `phc_talegaon`, `phc_alandi`)
   - `name`: Human-readable centre name (e.g. "PHC Kiwale")
   - `district`: District identifier (`"Pimpri-Chinchwad"` or `"Nation B"`)
   - `lat`, `lng`: Geographic coordinates
   - `bed_capacity`, `beds_occupied`: Facility capacity metrics
2. `medicines`:
   - `id`: Medicine identifier (e.g. `med_insulin`, `med_ors`, `med_paracetamol`)
   - `name`: Full clinical formulation name (12 essential medicines)
   - `unit`: Unit of measure (`vials`, `sachets`, `strips`, `bottles`, `ampoules`, `inhalers`)
3. `stock`:
   - `phc_id`: Reference to PHC
   - `medicine_id`: Reference to Medicine
   - `current_qty`: Current quantity physically on hand
   - `avg_daily_consumption`: Moving average daily usage
   - `last_updated`: ISO UTC timestamp
4. `footfall`:
   - `phc_id`, `date` (YYYY-MM-DD), `patient_count` (21-day trailing historical series)
5. `staff_attendance`:
   - `phc_id`, `date` (YYYY-MM-DD), `present_count`, `total_staff`
6. `alerts`:
   - `id`, `phc_id`, `medicine_id`, `message`, `severity` (`critical`/`warning`), `created_at`, `resolved`, `donor_phc_name`, `surplus_qty`

---

## 8. API Endpoints Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | System status, database mode, and Gemini model verification |
| `GET` | `/phcs` | Lists all 8 PHCs with computed real-time status (`green`/`amber`/`red`) |
| `GET` | `/stock/{phc_id}` | Complete 12-item inventory table and days-left runway for a PHC |
| `GET` | `/forecast/{phc_id}` | Computes medicine runway, flags `at_risk: true` (<5d), and auto-generates alerts |
| `GET` | `/alerts` | Retrieves unresolved early warning directives, newest first |
| `POST` | `/simulate-crisis/{phc_id}/{medicine_id}` | Drops quantity to 2 units, triggers forecast+Gemini redistribution alert |
| `GET` | `/phc/{phc_id}/history` | Returns 21-day trailing footfall and attendance data for Chart.js |
| `POST` | `/alerts/{alert_id}/resolve` | Marks an alert as resolved and rebalances stock |
| `POST` | `/seed` | Idempotently resets database back to baseline demo scenario |

---

## 9. Local Setup & Quickstart Guide

### Prerequisites
- Python 3.11+ (Python 3.13 tested and verified)
- Node.js & npm (for optional Firebase deployment)
- A Google Gemini API key ([Google AI Studio](https://aistudio.google.com/))

### Step 1: Clone the Repository
```bash
git clone https://github.com/Shreyash463/Smart-Health-Supply-Chain-Resilience.git
cd Smart-Health-Supply-Chain-Resilience
```

### Step 2: Set Up Python Virtual Environment
```bash
# Windows
python -m venv venv
.\venv\Scripts\activate

# Linux / macOS
python3 -m venv venv
source venv/bin/activate
```

### Step 3: Install Dependencies
```bash
pip install -r requirements.txt
```

### Step 4: Configure Secrets (.env)
Copy the template and add your credentials:
```bash
cp .env.example .env
```
Edit `.env`:
```env
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-flash-latest
PORT=8000
HOST=0.0.0.0
# Optional: Path to Firebase Service Account JSON or inline JSON string
FIREBASE_SERVICE_ACCOUNT_JSON=
```

### Step 5: Seed the Database
```bash
python -m backend.seed_data
```

### Step 6: Run the Pytest Test Suite
```bash
pytest tests/test_api.py -v
```

### Step 7: Launch the Application
```bash
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```
Open your browser and navigate to:
**`http://localhost:8000`**

---

## 10. Live Demo Walkthrough (For Hackathon Judges)

1. **Initial Assessment & Network Resilience Map**:
   - Notice the **Network Resilience Map** plotting all 8 facilities across *District 1 (Pimpri-Chinchwad)* and *District 2 (Nation B)*.
   - **PHC Kiwale** and **PHC Alandi** appear as pulsing vermillion nodes with an active **animated lateral transfer arc** drawn from their respective intra-district donor facilities (**PHC Talegaon** and **PHC Khed**).
   - In the **Health Centre Ledger**, observe figures rendered in clean tabular lining numerals.
2. **Interactive PHC Inspection**:
   - Click any node on the map or click **Inspect** on a ledger row (e.g. *PHC Kiwale*).
   - Review the **21-day historical footfall & attendance chart** (Chart.js) and the color-coded **runway progress bars**.
3. **Trigger Live Crisis Simulation**:
   - On a healthy green facility (e.g., **PHC Chikhli**), click the **Simulate crisis** button.
   - The button initiates `POST /simulate-crisis/...` for that centre's healthiest medicine.
   - Watch the facility node dynamically turn vermillion on the map, a new **animated redistribution arc** appear connecting the donor facility, and a new 2–3 line Gemini redistribution recommendation populate on the **Operations Dispatch Wire**!
4. **Resolution & Rebalancing**:
   - Click **Acknowledge & resolve** on the dispatch wire.
   - Observe that the alert clears, clinical inventory is rebalanced, the facility status immediately returns to green, and the **Critical Stockouts** counter in the masthead reduces instantly.
5. **District Filter & Mobile Inspection**:
   - Switch between `All centres`, `Pimpri-Chinchwad`, and `Nation B nodes` tabs.
   - Resize the window or inspect on a mobile device to confirm full touch responsiveness and WCAG AA contrast.

---

## 10. Cloud Deployment Guide

### Deploying Backend to Google Cloud Run
```bash
# Set your GCP Project ID
export GOOGLE_CLOUD_PROJECT="your-gcp-project-id"

# Run deployment script
chmod +x deploy.sh
./deploy.sh

# Or directly via gcloud:
gcloud run deploy smart-health-resilience \
  --source . \
  --region asia-south1 \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars GEMINI_API_KEY="your-key",GEMINI_MODEL="gemini-flash-latest"
```

### Deploying Frontend to Firebase Hosting
```bash
firebase login
firebase use your-firebase-project-id
firebase deploy --only hosting
```

---

## 11. Assumptions & Design Decisions
- **Donor PHC Reserve Buffer**: When calculating transferable surplus, the engine enforces a mandatory 7-day reserve buffer for the donor PHC (`surplus = current_qty - (daily_consumption * 7)`), ensuring donor facilities are never compromised.
- **Intra-District Matching**: Transfers are strictly prioritized within the same geographic district to ensure physical ground transit can be completed within 1–3 hours.
- **Quota & Offline Resilience**: In the event of temporary third-party API rate limits, the system seamlessly applies deterministic rule-based operational recommendations without disrupting user workflows or throwing 500 errors.

---

## 12. Authors & Acknowledgements
- **Author**: Built with AI Team
- **Track**: Track 3: Resilience (Build with AI: Code for Communities — 2nd Edition)
- **Theme**: BRICS Public Health Network Supply Chain Continuity
- **Submission Date**: September 2026
