from typing import List, Dict
from datetime import datetime, timedelta


def classify_acwr_risk(acwr: float) -> str:
    """Classify ACWR into risk level."""
    if acwr is None or acwr == 0:
        return "unknown"
    if acwr < 0.8:
        return "low"
    elif acwr <= 1.3:
        return "optimal"
    elif acwr <= 1.5:
        return "moderate"
    return "high"


def calculate_training_load(total_distance: float, high_intensity_distance: float,
                            sprint_distance: float, number_of_sprints: int,
                            number_of_accelerations: int, number_of_decelerations: int) -> float:
    """Calculate training load from GPS data using a weighted formula"""
    load = (
        total_distance * 0.001 +
        high_intensity_distance * 0.003 +
        sprint_distance * 0.005 +
        number_of_sprints * 2 +
        number_of_accelerations * 1 +
        number_of_decelerations * 1
    )
    return round(load, 2)


def calculate_metric_acwr(acute_values: List[float], chronic_values: List[float]) -> tuple:
    """Calculate ACWR for a specific metric"""
    if not acute_values or not chronic_values:
        return 0, 0, 0, "unknown"
    
    acute_load = sum(acute_values)
    chronic_load = sum(chronic_values) / 4 if chronic_values else 0
    
    if chronic_load > 0:
        acwr_ratio = round(acute_load / chronic_load, 2)
    else:
        acwr_ratio = 0
    
    if acwr_ratio < 0.8:
        risk_level = "low"
    elif 0.8 <= acwr_ratio <= 1.3:
        risk_level = "optimal"
    elif 1.3 < acwr_ratio <= 1.5:
        risk_level = "moderate"
    else:
        risk_level = "high"
    
    return round(acute_load, 2), round(chronic_load, 2), acwr_ratio, risk_level


def calculate_rolling_average(
    gps_data_by_date: dict,
    metric_key: str,
    window_size: int,
    end_date: datetime
) -> float:
    """
    Calcula media movel REAL incluindo dias sem treino como ZERO.
    """
    total = 0.0
    for i in range(window_size):
        date = (end_date - timedelta(days=i)).strftime("%Y-%m-%d")
        day_data = gps_data_by_date.get(date, {})
        value = day_data.get(metric_key, 0) or 0
        total += value
    
    return total / window_size if window_size > 0 else 0


def calculate_rolling_acwr(
    gps_data_by_date: dict,
    metric_key: str,
    current_date: datetime = None
) -> tuple:
    """
    Calcula ACWR com rolling window real - inclui dias sem treino como ZERO.
    Returns: (acute_load, chronic_load, acwr_ratio, risk_level)
    """
    if current_date is None:
        current_date = datetime.utcnow()
    
    acute_load = calculate_rolling_average(gps_data_by_date, metric_key, 7, current_date)
    chronic_load = calculate_rolling_average(gps_data_by_date, metric_key, 28, current_date)
    
    if chronic_load > 0:
        acwr_ratio = round(acute_load / chronic_load, 2)
    else:
        acwr_ratio = 0
    
    if acwr_ratio < 0.8:
        risk_level = "low"
    elif 0.8 <= acwr_ratio <= 1.3:
        risk_level = "optimal"
    elif 1.3 < acwr_ratio <= 1.5:
        risk_level = "moderate"
    else:
        risk_level = "high"
    
    return round(acute_load, 2), round(chronic_load, 2), acwr_ratio, risk_level


def extract_gps_metrics_from_session(gps_records: List[dict]) -> dict:
    """
    Extract and calculate GPS metrics from a session's records.
    """
    if not gps_records:
        return {
            "total_distance": 0, "hid_z3": 0, "hsr_z4": 0,
            "sprint_z5": 0, "sprints_count": 0, "acc_dec_total": 0,
        }

    if len(gps_records) == 1 and "has_session_total" in gps_records[0]:
        r = gps_records[0]
        return {
            "total_distance": r.get("total_distance", 0),
            "hid_z3": r.get("high_intensity_distance", 0),
            "hsr_z4": r.get("high_speed_running", 0),
            "sprint_z5": r.get("sprint_distance", 0),
            "sprints_count": r.get("number_of_sprints", 0),
            "acc_dec_total": (
                r.get("number_of_accelerations", 0) +
                r.get("number_of_decelerations", 0)
            ),
        }

    _SESSION_KEYWORDS = {"session", "total", "full", "complete", "summary", "sessao"}
    _PERIOD_KEYWORDS = {"half", "1st", "2nd", "period", "split", "tempo", "parte"}

    session_total_record = None
    period_records = []

    for record in gps_records:
        pname = (record.get("period_name") or "").lower()
        is_session_total = any(kw in pname for kw in _SESSION_KEYWORDS)
        is_period = any(kw in pname for kw in _PERIOD_KEYWORDS)

        if is_session_total and not is_period:
            if session_total_record is None:
                session_total_record = record
        else:
            period_records.append(record)

    if session_total_record:
        source = [session_total_record]
    elif period_records:
        source = period_records
    else:
        source = gps_records

    metrics = {
        "total_distance": 0, "hid_z3": 0, "hsr_z4": 0,
        "sprint_z5": 0, "sprints_count": 0, "acc_dec_total": 0,
    }

    for record in source:
        metrics["total_distance"] += record.get("total_distance", 0)
        metrics["hid_z3"] += record.get("high_intensity_distance", 0)
        metrics["hsr_z4"] += record.get("high_speed_running", 0)
        metrics["sprint_z5"] += record.get("sprint_distance", 0)
        metrics["sprints_count"] += record.get("number_of_sprints", 0)
        metrics["acc_dec_total"] += (
            record.get("number_of_accelerations", 0) +
            record.get("number_of_decelerations", 0)
        )

    return metrics


# GPS session/period dedup constants (shared between dashboard, team-table, etc.)
GPS_SESSION_KEYWORDS = {"session", "total", "full", "complete", "summary", "sessao"}
GPS_PERIOD_KEYWORDS = {"half", "1st", "2nd", "period", "split", "tempo", "parte"}
