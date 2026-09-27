from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime

class PHC(BaseModel):
    id: str
    name: str
    district: str
    lat: float
    lng: float
    contact_phone: Optional[str] = "+91 20 2742 5555"
    bed_capacity: Optional[int] = 30
    beds_occupied: Optional[int] = 18

class Medicine(BaseModel):
    id: str
    name: str
    unit: str
    category: Optional[str] = "Essential Medicine"

class StockItem(BaseModel):
    phc_id: str
    medicine_id: str
    current_qty: int
    avg_daily_consumption: float
    last_updated: str = Field(default_factory=lambda: datetime.utcnow().isoformat())

class FootfallRecord(BaseModel):
    phc_id: str
    date: str
    patient_count: int

class StaffAttendanceRecord(BaseModel):
    phc_id: str
    date: str
    present_count: int
    total_staff: int

class Alert(BaseModel):
    id: str
    phc_id: str
    medicine_id: str
    message: str
    severity: str  # "critical", "warning", "info"
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    resolved: bool = False
    source: Optional[str] = "Gemini Flash AI Engine"

class MedicineForecast(BaseModel):
    medicine_id: str
    medicine_name: str
    unit: str
    current_qty: int
    avg_daily_consumption: float
    days_left: float
    at_risk: bool
    status: str  # "red", "amber", "green"
    has_active_alert: bool = False
    active_alert_id: Optional[str] = None

class PHCStatusSummary(BaseModel):
    id: str
    name: str
    district: str
    lat: float
    lng: float
    status: str  # "green", "amber", "red"
    worst_days_left: float
    at_risk_medicines_count: int
    total_medicines_count: int
    active_alerts_count: int
    bed_capacity: int
    beds_occupied: int
    today_staff_present: int
    today_total_staff: int
    today_patient_footfall: int
