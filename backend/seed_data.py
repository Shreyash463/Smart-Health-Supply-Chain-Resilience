import os
import random
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Any
from backend.database import db

PHCS = [
    # District 1: Pimpri-Chinchwad
    {
        "id": "phc_kiwale",
        "name": "PHC Kiwale",
        "district": "Pimpri-Chinchwad",
        "lat": 18.6657,
        "lng": 73.7432,
        "contact_phone": "+91 20 2742 5101",
        "bed_capacity": 30,
        "beds_occupied": 21
    },
    {
        "id": "phc_talegaon",
        "name": "PHC Talegaon",
        "district": "Pimpri-Chinchwad",
        "lat": 18.7282,
        "lng": 73.6844,
        "contact_phone": "+91 20 2742 5102",
        "bed_capacity": 35,
        "beds_occupied": 19
    },
    {
        "id": "phc_chikhli",
        "name": "PHC Chikhli",
        "district": "Pimpri-Chinchwad",
        "lat": 18.6745,
        "lng": 73.8055,
        "contact_phone": "+91 20 2742 5103",
        "bed_capacity": 25,
        "beds_occupied": 14
    },
    {
        "id": "phc_dehu_road",
        "name": "PHC Dehu Road",
        "district": "Pimpri-Chinchwad",
        "lat": 18.6833,
        "lng": 73.7225,
        "contact_phone": "+91 20 2742 5104",
        "bed_capacity": 28,
        "beds_occupied": 20
    },
    # District 2: Nation B (Regional Cross-Border Partner Nodes)
    {
        "id": "phc_alandi",
        "name": "PHC Alandi",
        "district": "Nation B",
        "lat": 18.6775,
        "lng": 73.8967,
        "contact_phone": "+91 2135 232101",
        "bed_capacity": 32,
        "beds_occupied": 25
    },
    {
        "id": "phc_khed",
        "name": "PHC Khed",
        "district": "Nation B",
        "lat": 18.8500,
        "lng": 73.9000,
        "contact_phone": "+91 2135 232102",
        "bed_capacity": 40,
        "beds_occupied": 24
    },
    {
        "id": "phc_shirur",
        "name": "PHC Shirur",
        "district": "Nation B",
        "lat": 18.8260,
        "lng": 74.3780,
        "contact_phone": "+91 2135 232103",
        "bed_capacity": 30,
        "beds_occupied": 16
    },
    {
        "id": "phc_junnar",
        "name": "PHC Junnar",
        "district": "Nation B",
        "lat": 19.2064,
        "lng": 73.8767,
        "contact_phone": "+91 2135 232104",
        "bed_capacity": 35,
        "beds_occupied": 18
    }
]

MEDICINES = [
    {"id": "med_paracetamol", "name": "Paracetamol 500mg Tablets", "unit": "strips", "category": "Analgesic / Antipyretic"},
    {"id": "med_ors", "name": "Oral Rehydration Salts (ORS)", "unit": "sachets", "category": "Electrolyte Solution"},
    {"id": "med_amoxicillin", "name": "Amoxicillin 500mg Capsules", "unit": "capsules", "category": "Antibiotic"},
    {"id": "med_insulin", "name": "Insulin Regular 100 IU/mL", "unit": "vials", "category": "Hormone / Endocrine"},
    {"id": "med_iv_fluids", "name": "IV Normal Saline 0.9% 500ml", "unit": "bottles", "category": "Intravenous Infusion"},
    {"id": "med_artemether", "name": "Artemether + Lumefantrine", "unit": "strips", "category": "Antimalarial"},
    {"id": "med_azithromycin", "name": "Azithromycin 500mg Tablets", "unit": "strips", "category": "Antibiotic"},
    {"id": "med_metformin", "name": "Metformin 500mg Tablets", "unit": "strips", "category": "Antidiabetic"},
    {"id": "med_salbutamol", "name": "Salbutamol Inhaler 100mcg", "unit": "inhalers", "category": "Respiratory / Bronchodilator"},
    {"id": "med_oxytocin", "name": "Oxytocin Injection 10 IU/ml", "unit": "ampoules", "category": "Maternal Health / Labor"},
    {"id": "med_ciprofloxacin", "name": "Ciprofloxacin 500mg Tablets", "unit": "strips", "category": "Antibiotic"},
    {"id": "med_cetirizine", "name": "Cetirizine 10mg Tablets", "unit": "strips", "category": "Antihistamine"}
]

# Baseline stock parameters per medicine: (baseline_daily_consumption, standard_stock_days)
MEDICINE_BASELINES = {
    "med_paracetamol": (25.0, 20),
    "med_ors": (15.0, 18),
    "med_amoxicillin": (12.0, 16),
    "med_insulin": (4.0, 25),
    "med_iv_fluids": (10.0, 22),
    "med_artemether": (6.0, 15),
    "med_azithromycin": (8.0, 18),
    "med_metformin": (18.0, 24),
    "med_salbutamol": (3.5, 20),
    "med_oxytocin": (2.5, 20),
    "med_ciprofloxacin": (7.0, 17),
    "med_cetirizine": (14.0, 19)
}

def seed_database(force_reseed: bool = False):
    """Seed PHCs, Medicines, Stock, Footfall, and Staff Attendance into Firestore/Database."""
    existing_phcs = db.list_documents("phcs")
    if existing_phcs and not force_reseed:
        print("Database already contains data. Skipping full seed (force_reseed=False).")
        return

    print("Seeding database with realistic healthcare network data...")

    if force_reseed:
        # Clear previous alerts so reset restores clean baseline without leftover crisis alerts
        db.clear_collection("alerts")

    # 1. Seed PHCs
    for phc in PHCS:
        db.set_document("phcs", phc["id"], phc)

    # 2. Seed Medicines
    for med in MEDICINES:
        db.set_document("medicines", med["id"], med)

    # 3. Seed Stock for all PHC x Medicine combinations
    # Requirement: At least 2 PHCs already trending toward a stockout on different medicines
    # - PHC Kiwale: Critical stockout on Insulin (~2.3 days left)
    # - PHC Alandi: Critical stockout on ORS sachets (~2.5 days left)
    # - Surplus PHCs: PHC Talegaon has large surplus of Insulin; PHC Khed has surplus of ORS sachets
    now_iso = datetime.now(timezone.utc).isoformat()
    random.seed(42)  # Deterministic seed for reproducible demo states

    for phc in PHCS:
        phc_id = phc["id"]
        for med in MEDICINES:
            med_id = med["id"]
            base_cons, base_days = MEDICINE_BASELINES[med_id]
            # Vary consumption slightly per PHC
            daily_cons = round(base_cons * random.uniform(0.85, 1.25), 1)

            # Targeted stockout scenarios for live demo catch on first load:
            if phc_id == "phc_kiwale" and med_id == "med_insulin":
                # Stockout: ~2.3 days left (< 5 days)
                current_qty = 8
                daily_cons = 3.5
            elif phc_id == "phc_talegaon" and med_id == "med_insulin":
                # High surplus in same district (Pimpri-Chinchwad): ~50 days left
                daily_cons = 4.0
                current_qty = 210
            elif phc_id == "phc_alandi" and med_id == "med_ors":
                # Stockout: ~2.5 days left (< 5 days) in Nation B
                current_qty = 30
                daily_cons = 12.0
            elif phc_id == "phc_khed" and med_id == "med_ors":
                # High surplus in same district (Nation B): ~35 days left
                daily_cons = 15.0
                current_qty = 520
            elif phc_id == "phc_dehu_road" and med_id == "med_amoxicillin":
                # Amber level (~6.2 days left)
                daily_cons = 8.0
                current_qty = 50
            elif phc_id == "phc_shirur" and med_id == "med_oxytocin":
                # Amber level (~7.5 days left)
                daily_cons = 2.0
                current_qty = 15
            else:
                # Normal healthy stock (between 12 and 30 days)
                days = random.uniform(14, 28)
                current_qty = int(daily_cons * days)

            stock_doc_id = f"{phc_id}_{med_id}"
            stock_data = {
                "id": stock_doc_id,
                "phc_id": phc_id,
                "medicine_id": med_id,
                "current_qty": current_qty,
                "avg_daily_consumption": daily_cons,
                "last_updated": now_iso
            }
            db.set_document("stock", stock_doc_id, stock_data)

    # 4. Seed 21 Days (3 Weeks) Trailing History: Footfall & Staff Attendance
    today = datetime.now(timezone.utc).date()
    for phc in PHCS:
        phc_id = phc["id"]
        base_patients = 75 if phc["district"] == "Pimpri-Chinchwad" else 60

        for day_offset in range(21, -1, -1):
            date_str = (today - timedelta(days=day_offset)).strftime("%Y-%m-%d")
            
            # Weekend variation
            is_weekend = (today - timedelta(days=day_offset)).weekday() >= 5
            weekend_multiplier = 0.65 if is_weekend else 1.05

            # Historical footfall
            noise = random.randint(-12, 18)
            patients = max(20, int((base_patients + noise) * weekend_multiplier))
            footfall_id = f"{phc_id}_{date_str}"
            db.set_document("footfall", footfall_id, {
                "id": footfall_id,
                "phc_id": phc_id,
                "date": date_str,
                "patient_count": patients
            })

            # Historical staff attendance
            total_staff = 14 if phc["district"] == "Pimpri-Chinchwad" else 12
            absent = random.choice([0, 1, 1, 2, 3])
            present = max(5, total_staff - absent)
            attendance_id = f"{phc_id}_{date_str}"
            db.set_document("staff_attendance", attendance_id, {
                "id": attendance_id,
                "phc_id": phc_id,
                "date": date_str,
                "present_count": present,
                "total_staff": total_staff
            })

    print(f"Database seeded successfully with {len(PHCS)} PHCs, {len(MEDICINES)} Medicines, 21-day time series.")

if __name__ == "__main__":
    seed_database(force_reseed=True)
