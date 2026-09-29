import os
import sys
# Ensure project root is in sys.path when executed directly
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if project_root not in sys.path:
    sys.path.insert(0, project_root)

import logging
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from dotenv import load_dotenv

from backend.database import db
from backend.models import PHC, StockItem, Alert, PHCStatusSummary, MedicineForecast
from backend.seed_data import seed_database
from backend.gemini_service import gemini_service

load_dotenv()

# Logging configuration
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("health_resilience.api")

from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Ensure database has baseline seeded data on server start."""
    seed_database(force_reseed=False)
    try:
        run_network_wide_forecast_scan()
    except Exception as e:
        logger.error(f"Initial forecast scan error: {e}")
    yield

app = FastAPI(
    title="Smart Health & Supply Chain Resilience API",
    description="Track 3: Resilience — Decentralized Healthcare Resource Early Warning & Redistribution Engine",
    version="1.0.0",
    lifespan=lifespan
)

# Enable CORS for cross-origin frontend requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def run_network_wide_forecast_scan():
    """Scans all PHCs and generates alerts for any stock with days_left < 5."""
    all_phcs = db.list_documents("phcs")
    for phc in all_phcs:
        phc_id = phc["id"]
        stocks = db.query_documents("stock", {"phc_id": phc_id})
        for s in stocks:
            med_id = s.get("medicine_id")
            qty = s.get("current_qty", 0)
            daily_cons = s.get("avg_daily_consumption", 1.0)
            if daily_cons <= 0:
                daily_cons = 1.0
            days_left = qty / daily_cons
            if days_left < 5.0:
                gemini_service.generate_stockout_alert(
                    db_instance=db,
                    phc_id=phc_id,
                    medicine_id=med_id,
                    current_qty=qty,
                    days_left=days_left,
                    avg_daily_consumption=daily_cons
                )

# ---------------------------------------------------------
# Core Endpoints Required by Brief
# ---------------------------------------------------------

@app.get("/health", tags=["System"])
def health_check():
    """System health check and configuration status."""
    return {
        "status": "healthy",
        "service": "Smart Health & Supply Chain Resilience API",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "database_backend": "Firebase Firestore" if db.is_firestore else "Resilient Local Data Store",
        "ai_model": gemini_service.model_name,
        "gemini_api_configured": bool(gemini_service.api_key)
    }

@app.get("/phcs", tags=["PHCs"])
def get_phcs() -> List[Dict[str, Any]]:
    """
    List all PHCs with a computed status (green/amber/red)
    based on worst-case medicine forecast at that PHC.
    """
    phcs = db.list_documents("phcs")
    active_alerts = [a for a in db.list_documents("alerts") if not a.get("resolved", False)]
    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    summaries = []
    for phc in phcs:
        phc_id = phc["id"]
        stocks = db.query_documents("stock", {"phc_id": phc_id})
        phc_alerts = [a for a in active_alerts if a.get("phc_id") == phc_id]

        worst_days = 999.0
        at_risk_count = 0
        amber_count = 0
        healthiest_med_id = None
        max_days = -1.0

        for s in stocks:
            qty = s.get("current_qty", 0)
            daily_cons = s.get("avg_daily_consumption", 1.0)
            if daily_cons <= 0:
                daily_cons = 1.0
            days_left = qty / daily_cons

            if days_left < worst_days:
                worst_days = days_left

            if days_left < 5.0:
                at_risk_count += 1
            elif days_left < 10.0:
                amber_count += 1

            if days_left > max_days:
                max_days = days_left
                healthiest_med_id = s.get("medicine_id")

        # Color-code determination: pure function of live stock array
        # Green = everything > 10 days left
        # Amber = something < 10 days left
        # Red = something < 5 days left (at-risk stockout)
        if worst_days < 5.0 or at_risk_count > 0:
            status = "red"
        elif worst_days < 10.0 or amber_count > 0:
            status = "amber"
        else:
            status = "green"

        # Today's footfall and attendance
        today_footfall = db.get_document("footfall", f"{phc_id}_{today_str}")
        patient_count = today_footfall.get("patient_count", 65) if today_footfall else 65

        today_staff = db.get_document("staff_attendance", f"{phc_id}_{today_str}")
        staff_present = today_staff.get("present_count", 11) if today_staff else 11
        staff_total = today_staff.get("total_staff", 14) if today_staff else 14

        summary = {
            "id": phc_id,
            "name": phc.get("name"),
            "district": phc.get("district"),
            "lat": phc.get("lat"),
            "lng": phc.get("lng"),
            "contact_phone": phc.get("contact_phone", "+91 20 2742 5555"),
            "status": status,
            "worst_days_left": round(worst_days, 1) if worst_days != 999.0 else 30.0,
            "at_risk_medicines_count": at_risk_count,
            "total_medicines_count": len(stocks),
            "active_alerts_count": len(phc_alerts),
            "healthiest_medicine_id": healthiest_med_id or "med_paracetamol",
            "bed_capacity": phc.get("bed_capacity", 30),
            "beds_occupied": phc.get("beds_occupied", 18),
            "today_patient_footfall": patient_count,
            "today_staff_present": staff_present,
            "today_total_staff": staff_total
        }
        summaries.append(summary)

    # Sort so red status is displayed prominently first, followed by amber and green
    priority_order = {"red": 0, "amber": 1, "green": 2}
    summaries.sort(key=lambda x: (priority_order.get(x["status"], 3), x["name"]))
    return summaries

@app.get("/stock/{phc_id}", tags=["Stock"])
def get_phc_stock(phc_id: str) -> Dict[str, Any]:
    """Full stock table for one PHC."""
    phc = db.get_document("phcs", phc_id)
    if not phc:
        raise HTTPException(status_code=404, detail=f"PHC '{phc_id}' not found.")

    stocks = db.query_documents("stock", {"phc_id": phc_id})
    medicines = {m["id"]: m for m in db.list_documents("medicines")}
    active_alerts = {a["medicine_id"]: a for a in db.list_documents("alerts") if a.get("phc_id") == phc_id and not a.get("resolved", False)}

    items = []
    for s in stocks:
        med_id = s.get("medicine_id")
        med = medicines.get(med_id, {"name": med_id, "unit": "units", "category": "General"})
        qty = s.get("current_qty", 0)
        daily_cons = s.get("avg_daily_consumption", 1.0)
        if daily_cons <= 0:
            daily_cons = 1.0
        days_left = qty / daily_cons

        if days_left < 5.0:
            status = "red"
        elif days_left < 10.0:
            status = "amber"
        else:
            status = "green"

        has_alert = med_id in active_alerts
        items.append({
            "medicine_id": med_id,
            "name": med.get("name"),
            "category": med.get("category"),
            "unit": med.get("unit"),
            "current_qty": qty,
            "avg_daily_consumption": daily_cons,
            "days_left": round(days_left, 1),
            "status": status,
            "has_active_alert": has_alert,
            "active_alert_message": active_alerts[med_id].get("message") if has_alert else None,
            "last_updated": s.get("last_updated")
        })

    items.sort(key=lambda x: (x["days_left"], x["name"]))
    return {
        "phc": phc,
        "items": items,
        "total_items": len(items)
    }

@app.get("/forecast/{phc_id}", tags=["Forecast"])
def get_phc_forecast(phc_id: str) -> Dict[str, Any]:
    """
    For every medicine at that PHC, compute days_left = current_qty / avg_daily_consumption;
    flag at_risk: true if days_left < 5.
    Automatically checks and invokes Gemini redistribution pipeline if no active alert exists.
    """
    phc = db.get_document("phcs", phc_id)
    if not phc:
        raise HTTPException(status_code=404, detail=f"PHC '{phc_id}' not found.")

    stocks = db.query_documents("stock", {"phc_id": phc_id})
    medicines = {m["id"]: m for m in db.list_documents("medicines")}
    active_alerts = {a["medicine_id"]: a for a in db.list_documents("alerts") if a.get("phc_id") == phc_id and not a.get("resolved", False)}

    forecast_items = []
    generated_alerts = []

    for s in stocks:
        med_id = s.get("medicine_id")
        med = medicines.get(med_id, {"name": med_id, "unit": "units"})
        qty = s.get("current_qty", 0)
        daily_cons = s.get("avg_daily_consumption", 1.0)
        if daily_cons <= 0:
            daily_cons = 1.0

        days_left = qty / daily_cons
        is_at_risk = days_left < 5.0

        if days_left < 5.0:
            status = "red"
        elif days_left < 10.0:
            status = "amber"
        else:
            status = "green"

        has_alert = med_id in active_alerts
        alert_id = active_alerts[med_id]["id"] if has_alert else None

        # Whenever /forecast finds an item with at_risk: true:
        # Check if unresolved alert already exists -> skip. Otherwise call Gemini and write to alerts.
        if is_at_risk and not has_alert:
            new_alert = gemini_service.generate_stockout_alert(
                db_instance=db,
                phc_id=phc_id,
                medicine_id=med_id,
                current_qty=qty,
                days_left=days_left,
                avg_daily_consumption=daily_cons
            )
            if new_alert:
                has_alert = True
                alert_id = new_alert["id"]
                generated_alerts.append(new_alert)

        forecast_items.append({
            "medicine_id": med_id,
            "medicine_name": med.get("name"),
            "unit": med.get("unit"),
            "current_qty": qty,
            "avg_daily_consumption": daily_cons,
            "days_left": round(days_left, 1),
            "at_risk": is_at_risk,
            "status": status,
            "has_active_alert": has_alert,
            "active_alert_id": alert_id
        })

    forecast_items.sort(key=lambda x: x["days_left"])
    return {
        "phc_id": phc_id,
        "phc_name": phc.get("name"),
        "district": phc.get("district"),
        "forecast": forecast_items,
        "newly_generated_alerts": generated_alerts
    }

@app.get("/alerts", tags=["Alerts"])
def get_alerts(show_all: bool = Query(False, description="Include resolved alerts")) -> List[Dict[str, Any]]:
    """All unresolved alerts, newest first (or all if show_all=True)."""
    alerts = db.list_documents("alerts")
    if not show_all:
        alerts = [a for a in alerts if not a.get("resolved", False)]

    # Newest first
    alerts.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return alerts

@app.post("/simulate-crisis/{phc_id}/{medicine_id}", tags=["Simulation"])
def simulate_crisis(phc_id: str, medicine_id: str) -> Dict[str, Any]:
    """
    Manually drops that medicine's current_qty to a near-zero value at that PHC (for live demo purposes),
    then immediately runs the forecast+alert pipeline for that item and returns the generated alert.
    """
    phc = db.get_document("phcs", phc_id)
    if not phc:
        raise HTTPException(status_code=404, detail=f"PHC '{phc_id}' not found.")

    stock_doc_id = f"{phc_id}_{medicine_id}"
    stock_item = db.get_document("stock", stock_doc_id)
    if not stock_item:
        raise HTTPException(status_code=404, detail=f"Stock item for PHC '{phc_id}' and Medicine '{medicine_id}' not found.")

    # 1. Drop stock to critical near-zero level (2 units)
    critical_qty = 2
    daily_cons = stock_item.get("avg_daily_consumption", 2.0)
    if daily_cons <= 0:
        daily_cons = 2.0
    days_left = critical_qty / daily_cons

    now_iso = datetime.now(timezone.utc).isoformat()
    db.update_document("stock", stock_doc_id, {
        "current_qty": critical_qty,
        "last_updated": now_iso
    })

    # 2. Immediately run forecast + alert pipeline (checks for existing unresolved alert to prevent duplicates)
    generated_alert = gemini_service.generate_stockout_alert(
        db_instance=db,
        phc_id=phc_id,
        medicine_id=medicine_id,
        current_qty=critical_qty,
        days_left=days_left,
        avg_daily_consumption=daily_cons
    )

    med_doc = db.get_document("medicines", medicine_id)
    medicine_name = med_doc.get("name", medicine_id) if med_doc else medicine_id

    logger.info(f"Simulate Crisis fired for {phc.get('name')} - {medicine_name}: Alert {generated_alert.get('id') if generated_alert else 'none'}")

    return {
        "success": True,
        "message": f"Simulated crisis triggered for {phc.get('name')} - {medicine_name}.",
        "phc_id": phc_id,
        "phc_name": phc.get("name"),
        "medicine_id": medicine_id,
        "medicine_name": medicine_name,
        "new_quantity": critical_qty,
        "days_left": round(days_left, 1),
        "alert": generated_alert
    }

# ---------------------------------------------------------
# Supplementary Endpoints for Detail Views & Live Demos
# ---------------------------------------------------------

@app.get("/phc/{phc_id}/history", tags=["PHCs"])
def get_phc_history(phc_id: str) -> Dict[str, Any]:
    """Returns trailing 21 days of footfall and staff attendance for Chart.js visualization."""
    phc = db.get_document("phcs", phc_id)
    if not phc:
        raise HTTPException(status_code=404, detail=f"PHC '{phc_id}' not found.")

    all_footfall = db.query_documents("footfall", {"phc_id": phc_id})
    all_attendance = db.query_documents("staff_attendance", {"phc_id": phc_id})

    all_footfall.sort(key=lambda x: x.get("date", ""))
    all_attendance.sort(key=lambda x: x.get("date", ""))

    return {
        "phc_id": phc_id,
        "phc_name": phc.get("name"),
        "footfall": all_footfall,
        "staff_attendance": all_attendance
    }

@app.post("/alerts/{alert_id}/resolve", tags=["Alerts"])
def resolve_alert(alert_id: str) -> Dict[str, Any]:
    """Marks an alert as resolved and rebalances stock to safe operational levels."""
    alert = db.get_document("alerts", alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail=f"Alert '{alert_id}' not found.")

    phc_id = alert.get("phc_id")
    medicine_id = alert.get("medicine_id")
    donor_id = alert.get("donor_phc_id")
    now_iso = datetime.now(timezone.utc).isoformat()

    db.update_document("alerts", alert_id, {
        "resolved": True,
        "resolved_at": now_iso
    })

    # Replenish recipient PHC's stock so at-risk condition immediately clears
    stock_doc_id = f"{phc_id}_{medicine_id}"
    target_stock = db.get_document("stock", stock_doc_id)
    if target_stock:
        daily_cons = target_stock.get("avg_daily_consumption", 2.0)
        if daily_cons <= 0:
            daily_cons = 2.0
        # Restore stock to a safe 14-day runway
        replenish_qty = int(daily_cons * 14)
        transferred_amount = max(replenish_qty - target_stock.get("current_qty", 0), int(daily_cons * 8))
        new_qty = target_stock.get("current_qty", 0) + transferred_amount
        db.update_document("stock", stock_doc_id, {
            "current_qty": new_qty,
            "last_updated": now_iso
        })

        # Deduct transferred amount from donor PHC if specified
        if donor_id:
            donor_stock_id = f"{donor_id}_{medicine_id}"
            donor_stock = db.get_document("stock", donor_stock_id)
            if donor_stock:
                donor_qty = max(0, donor_stock.get("current_qty", 0) - transferred_amount)
                db.update_document("stock", donor_stock_id, {
                    "current_qty": donor_qty,
                    "last_updated": now_iso
                })

    return {
        "success": True,
        "alert_id": alert_id,
        "resolved": True,
        "phc_id": phc_id,
        "medicine_id": medicine_id,
        "message": f"Alert {alert_id} resolved and stock rebalanced successfully."
    }

@app.post("/seed", tags=["System"])
def trigger_seed(force: bool = True) -> Dict[str, Any]:
    """Resets and re-seeds database with fresh demo scenario."""
    seed_database(force_reseed=force)
    run_network_wide_forecast_scan()
    return {"success": True, "message": "Database reset and re-seeded with demo baseline."}

# ---------------------------------------------------------
# Static File Mounting for Standalone Full-Stack Mode
# ---------------------------------------------------------
frontend_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "frontend")
if os.path.exists(frontend_dir):
    app.mount("/static", StaticFiles(directory=frontend_dir), name="static")

    @app.get("/", include_in_schema=False)
    def serve_frontend_root():
        index_file = os.path.join(frontend_dir, "index.html")
        if os.path.exists(index_file):
            return FileResponse(index_file)
        return {"message": "Smart Health & Supply Chain Resilience API. Frontend not found."}

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "8000"))
    host = os.getenv("HOST", "0.0.0.0")
    uvicorn.run("backend.main:app", host=host, port=port, reload=True)
