import os
import uuid
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any, Tuple
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("health_resilience.gemini")

class GeminiAlertService:
    def __init__(self):
        self.api_key = os.getenv("GEMINI_API_KEY", "").strip()
        self.model_name = os.getenv("GEMINI_MODEL", "gemini-flash-latest").strip()
        self.client = None
        self._init_client()

    def _init_client(self):
        if self.api_key:
            try:
                from google import genai
                self.client = genai.Client(api_key=self.api_key)
                logger.info(f"Gemini Client initialized with model {self.model_name}")
            except Exception as e:
                logger.error(f"Failed to initialize google-genai Client: {e}")
                self.client = None
        else:
            logger.warning("GEMINI_API_KEY not found in environment. Rule-based fallback active.")

    def find_district_surplus(
        self,
        db_instance,
        phc_id: str,
        medicine_id: str,
        target_phc: Dict[str, Any]
    ) -> Tuple[Optional[Dict[str, Any]], int]:
        """
        Look across the other PHCs in the SAME district for surplus of the same medicine
        (current_qty well above their own average need).
        Reserves at least 7 days of consumption for the donor PHC.
        """
        district = target_phc.get("district")
        all_phcs = db_instance.list_documents("phcs")
        district_peer_ids = [
            p["id"] for p in all_phcs
            if p.get("district") == district and p["id"] != phc_id
        ]

        best_surplus_phc = None
        best_surplus_qty = 0

        for peer_id in district_peer_ids:
            peer_stock_id = f"{peer_id}_{medicine_id}"
            peer_stock = db_instance.get_document("stock", peer_stock_id)
            if not peer_stock:
                continue

            qty = peer_stock.get("current_qty", 0)
            daily_cons = peer_stock.get("avg_daily_consumption", 1.0)
            if daily_cons <= 0:
                daily_cons = 1.0

            days_left = qty / daily_cons
            # Surplus condition: more than 10 days of stock
            if days_left > 10:
                safety_buffer = int(daily_cons * 7)
                available_surplus = max(0, qty - safety_buffer)
                if available_surplus > best_surplus_qty:
                    best_surplus_qty = available_surplus
                    peer_doc = db_instance.get_document("phcs", peer_id)
                    best_surplus_phc = peer_doc

        return best_surplus_phc, best_surplus_qty

    def generate_stockout_alert(
        self,
        db_instance,
        phc_id: str,
        medicine_id: str,
        current_qty: int,
        days_left: float,
        avg_daily_consumption: float
    ) -> Optional[Dict[str, Any]]:
        """
        Generates and saves a Gemini-powered redistribution or procurement alert
        if an unresolved alert does not already exist.
        """
        # 1. Check whether an unresolved alert already exists for that exact phc_id + medicine_id pair
        all_alerts = db_instance.list_documents("alerts")
        existing_active = [
            a for a in all_alerts
            if a.get("phc_id") == phc_id
            and a.get("medicine_id") == medicine_id
            and not a.get("resolved", False)
        ]

        if existing_active:
            # Skip: don't spam duplicate alerts on every call
            logger.info(f"Unresolved alert already exists for {phc_id} - {medicine_id}. Skipping duplicate.")
            return existing_active[0]

        target_phc = db_instance.get_document("phcs", phc_id) or {"name": phc_id, "district": "Unknown"}
        medicine_doc = db_instance.get_document("medicines", medicine_id) or {"name": medicine_id, "unit": "units"}

        phc_name = target_phc.get("name", phc_id)
        district = target_phc.get("district", "Unknown")
        medicine_name = medicine_doc.get("name", medicine_id)
        unit = medicine_doc.get("unit", "units")

        # 2. Look across the other PHCs in the SAME district for surplus
        surplus_phc, surplus_qty = self.find_district_surplus(
            db_instance, phc_id, medicine_id, target_phc
        )

        rounded_days = round(days_left, 1)

        # 3. Construct prompt verbatim based on prompt specification
        if surplus_phc and surplus_qty > 0:
            surplus_phc_name = surplus_phc.get("name", "Neighboring PHC")
            prompt = (
                f"You are a health-system operations assistant. Given:\n"
                f"PHC: {phc_name}, District: {district}\n"
                f"Medicine: {medicine_name}, Stock left: {current_qty} {unit} (~{rounded_days} days at current usage)\n"
                f"Nearby surplus: {surplus_phc_name} has {surplus_qty} {unit} surplus of the same medicine\n\n"
                f"Write a 2-3 line alert for a district health officer. State the risk plainly,\n"
                f"recommend a SPECIFIC transfer quantity from {surplus_phc_name}, and give a one-line reason.\n"
                f"Plain English, no jargon, no bullet points, just 2-3 short sentences."
            )
            fallback_transfer = min(surplus_qty, int(avg_daily_consumption * 10))
            fallback_message = (
                f"{phc_name} in {district} faces an imminent stockout of {medicine_name} with only {current_qty} {unit} (~{rounded_days} days) remaining. "
                f"Immediately transfer {fallback_transfer} {unit} from {surplus_phc_name}, which holds a surplus of {surplus_qty} {unit}. "
                f"This cross-facility redistribution prevents patient treatment interruption while maintaining safety stock at both centres."
            )
        else:
            prompt = (
                f"You are a health-system operations assistant. Given:\n"
                f"PHC: {phc_name}, District: {district}\n"
                f"Medicine: {medicine_name}, Stock left: {current_qty} {unit} (~{rounded_days} days at current usage)\n\n"
                f"Write a 2-3 line alert for a district health officer. State the risk plainly,\n"
                f"recommend an emergency procurement order with a specific order quantity, and give a one-line reason.\n"
                f"Plain English, no jargon, no bullet points, just 2-3 short sentences."
            )
            recommended_order = int(max(50, avg_daily_consumption * 20))
            fallback_message = (
                f"Critical procurement alert: {phc_name} in {district} has only {current_qty} {unit} of {medicine_name} left (~{rounded_days} days of clinical stock). "
                f"No intra-district surplus is available, so an emergency procurement order of {recommended_order} {unit} must be dispatched immediately. "
                f"Expedited delivery is essential to prevent a complete stockout within the next 48 to 72 hours."
            )

        alert_text = fallback_message
        source_label = "Gemini Flash AI Engine"

        # 4. Invoke Gemini API (gemini-flash-latest)
        if self.client:
            try:
                response = self.client.models.generate_content(
                    model=self.model_name,
                    contents=prompt
                )
                if response and response.text:
                    alert_text = response.text.strip()
                    # Clean any accidental quotation marks or markdown headers
                    alert_text = alert_text.replace("```", "").strip()
                    logger.info("Successfully generated alert with gemini-flash-latest.")
            except Exception as e:
                logger.error(f"Gemini API invocation error: {e}. Utilizing operational fallback.")
                source_label = "Operational Fallback Rule Engine"
        else:
            source_label = "Operational Fallback Rule Engine"

        # 5. Write alert to database
        alert_id = f"alert_{uuid.uuid4().hex[:8]}"
        severity = "critical" if days_left < 3.0 else "warning"
        created_at = datetime.now(timezone.utc).isoformat()

        new_alert = {
            "id": alert_id,
            "phc_id": phc_id,
            "phc_name": phc_name,
            "district": district,
            "medicine_id": medicine_id,
            "medicine_name": medicine_name,
            "current_qty": current_qty,
            "days_left": rounded_days,
            "message": alert_text,
            "severity": severity,
            "created_at": created_at,
            "resolved": False,
            "source": source_label,
            "donor_phc_id": surplus_phc.get("id") if surplus_phc else None,
            "donor_phc_name": surplus_phc.get("name") if surplus_phc else None,
            "surplus_qty": surplus_qty if surplus_phc else 0
        }

        db_instance.set_document("alerts", alert_id, new_alert)
        return new_alert

gemini_service = GeminiAlertService()
