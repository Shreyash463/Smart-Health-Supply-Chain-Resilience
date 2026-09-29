import pytest
from fastapi.testclient import TestClient
from backend.main import app, run_network_wide_forecast_scan
from backend.database import db
from backend.seed_data import seed_database

@pytest.fixture(autouse=True)
def setup_database():
    seed_database(force_reseed=True)
    run_network_wide_forecast_scan()

client = TestClient(app)

def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "service" in data
    assert "ai_model" in data

def test_get_phcs():
    response = client.get("/phcs")
    assert response.status_code == 200
    phcs = response.json()
    assert len(phcs) == 8
    
    # Check required fields
    for p in phcs:
        assert "id" in p
        assert "name" in p
        assert "district" in p
        assert "status" in p
        assert p["status"] in ["green", "amber", "red"]
        assert "worst_days_left" in p
        assert "lat" in p
        assert "lng" in p

    # Confirm the 2 seeded stockouts make Kiwale and Alandi red
    phc_map = {p["id"]: p for p in phcs}
    assert phc_map["phc_kiwale"]["status"] == "red"
    assert phc_map["phc_alandi"]["status"] == "red"

def test_get_stock():
    response = client.get("/stock/phc_kiwale")
    assert response.status_code == 200
    data = response.json()
    assert data["phc"]["id"] == "phc_kiwale"
    assert len(data["items"]) == 12
    for item in data["items"]:
        assert "medicine_id" in item
        assert "current_qty" in item
        assert "avg_daily_consumption" in item
        assert "days_left" in item
        assert "status" in item

def test_get_forecast():
    response = client.get("/forecast/phc_kiwale")
    assert response.status_code == 200
    data = response.json()
    assert "forecast" in data
    assert len(data["forecast"]) == 12
    
    insulin_item = next(f for f in data["forecast"] if f["medicine_id"] == "med_insulin")
    assert insulin_item["at_risk"] is True
    assert insulin_item["days_left"] < 5.0

def test_get_alerts():
    response = client.get("/alerts")
    assert response.status_code == 200
    alerts = response.json()
    assert isinstance(alerts, list)
    assert len(alerts) >= 1
    for a in alerts:
        assert "phc_id" in a
        assert "medicine_id" in a
        assert "message" in a
        assert "severity" in a

def test_simulate_crisis():
    # Talegaon initially is green or amber
    phc_id = "phc_talegaon"
    med_id = "med_paracetamol"
    
    response = client.post(f"/simulate-crisis/{phc_id}/{med_id}")
    assert response.status_code == 200
    res_data = response.json()
    assert res_data["success"] is True
    assert res_data["new_quantity"] == 2
    assert res_data["days_left"] < 1.0
    assert "alert" in res_data
    assert res_data["alert"] is not None
    assert "message" in res_data["alert"]

    # Verify Talegaon is now red in /phcs
    phcs_res = client.get("/phcs")
    phc_map = {p["id"]: p for p in phcs_res.json()}
    assert phc_map[phc_id]["status"] == "red"

def test_history_endpoint():
    response = client.get("/phc/phc_kiwale/history")
    assert response.status_code == 200
    data = response.json()
    assert len(data["footfall"]) >= 21
    assert len(data["staff_attendance"]) >= 21

def test_resolve_alert():
    alerts_res = client.get("/alerts")
    alerts = alerts_res.json()
    assert len(alerts) > 0
    alert_to_resolve = alerts[0]["id"]

    resolve_res = client.post(f"/alerts/{alert_to_resolve}/resolve")
    assert resolve_res.status_code == 200
    assert resolve_res.json()["resolved"] is True

def test_duplicate_alert_prevention():
    # Trigger crisis on PHC Chikhli for Paracetamol
    phc_id = "phc_chikhli"
    med_id = "med_paracetamol"

    res1 = client.post(f"/simulate-crisis/{phc_id}/{med_id}")
    assert res1.status_code == 200
    alert_1 = res1.json()["alert"]

    # Trigger second time in a row
    res2 = client.post(f"/simulate-crisis/{phc_id}/{med_id}")
    assert res2.status_code == 200
    alert_2 = res2.json()["alert"]

    # Must return the SAME unresolved alert without duplicating
    assert alert_1["id"] == alert_2["id"]

    # Verify in the active alerts list there is only ONE active alert for this phc+med pair
    all_active = [
        a for a in client.get("/alerts").json()
        if a["phc_id"] == phc_id and a["medicine_id"] == med_id and not a.get("resolved", False)
    ]
    assert len(all_active) == 1

def test_reset_baseline_end_to_end():
    # 1. Trigger a crisis on a previously green PHC (Chikhli)
    client.post("/simulate-crisis/phc_chikhli/med_paracetamol")
    phcs = client.get("/phcs").json()
    chikhli = next(p for p in phcs if p["id"] == "phc_chikhli")
    assert chikhli["status"] == "red"

    # 2. Trigger Reset Baseline
    reset_res = client.post("/seed")
    assert reset_res.status_code == 200

    # 3. Verify Chikhli is restored to green, stock is restored, and only baseline alerts exist
    phcs_after = client.get("/phcs").json()
    chikhli_after = next(p for p in phcs_after if p["id"] == "phc_chikhli")
    assert chikhli_after["status"] == "green"
    assert chikhli_after["worst_days_left"] > 10.0

    active_alerts = client.get("/alerts").json()
    # No lingering alert for Chikhli
    chikhli_alerts = [a for a in active_alerts if a["phc_id"] == "phc_chikhli"]
    assert len(chikhli_alerts) == 0

def test_intra_district_surplus_isolation():
    # Kiwale is in Pimpri-Chinchwad; its Insulin stockout must match with Talegaon (also in Pimpri-Chinchwad), never Nation B
    alerts = client.get("/alerts").json()
    kiwale_alert = next((a for a in alerts if a["phc_id"] == "phc_kiwale"), None)
    if kiwale_alert and kiwale_alert.get("donor_phc_id"):
        assert kiwale_alert["donor_phc_id"] in ["phc_talegaon", "phc_chikhli", "phc_dehu_road"]
        assert "Pimpri-Chinchwad" in kiwale_alert["district"]
