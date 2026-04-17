import math
from typing import List


def calculate_jump_height_from_flight_time(flight_time_ms: float) -> float:
    """
    Calculate jump height from flight time using kinematic equation
    h = (g * t^2) / 8
    where t is flight time in seconds and g = 9.81 m/s^2
    """
    flight_time_s = flight_time_ms / 1000
    g = 9.81
    height_m = (g * (flight_time_s ** 2)) / 8
    return round(height_m * 100, 2)  # Convert to cm


def calculate_rsi(jump_height_cm: float, time_to_takeoff_ms: float) -> float:
    """
    Calculate RSImod (Reactive Strength Index Modified)
    RSImod = Jump Height (m) / Time to Takeoff (s)
    
    Unica formula de RSI no sistema.
    """
    if time_to_takeoff_ms <= 0:
        return 0
    jump_height_m = jump_height_cm / 100
    time_to_takeoff_s = time_to_takeoff_ms / 1000
    rsi = jump_height_m / time_to_takeoff_s
    return round(rsi, 2)


def calculate_rsi_modified(flight_time_ms: float, time_to_takeoff_ms: float) -> float:
    """
    DEPRECATED: Mantido para compatibilidade.
    Usa mesma formula RSImod = jumpHeight / time_to_takeoff.
    """
    if time_to_takeoff_ms <= 0 or flight_time_ms <= 0:
        return 0
    jump_height_cm = calculate_jump_height_from_flight_time(flight_time_ms)
    return calculate_rsi(jump_height_cm, time_to_takeoff_ms)


def calculate_peak_power_sayers(jump_height_cm: float, body_mass_kg: float) -> float:
    """
    Calculate Peak Power using Sayers Equation (1999)
    PP (Watts) = 60.7 x jump height (cm) + 45.3 x body mass (kg) - 2055
    """
    peak_power = (60.7 * jump_height_cm) + (45.3 * body_mass_kg) - 2055
    return round(max(0, peak_power), 1)


def calculate_peak_velocity(jump_height_cm: float) -> float:
    """
    Calculate Peak Velocity using kinematic equation
    v = sqrt(2 x g x h)
    """
    g = 9.81
    height_m = jump_height_cm / 100
    velocity = math.sqrt(2 * g * height_m)
    return round(velocity, 2)


# RSI Reference Values (based on sports science literature)
# RSImod Classification (CMJ-specific)
RSI_REFERENCES = {
    "excellent": {"min": 1.00, "label_pt": "Excelente", "label_en": "Excellent"},
    "very_good": {"min": 0.80, "label_pt": "Muito Bom", "label_en": "Very Good"},
    "good": {"min": 0.60, "label_pt": "Bom", "label_en": "Good"},
    "moderate": {"min": 0.40, "label_pt": "Moderado", "label_en": "Moderate"},
    "low": {"min": 0.25, "label_pt": "Baixo", "label_en": "Low"},
    "very_low": {"min": 0, "label_pt": "Muito Baixo", "label_en": "Very Low"}
}

# Fatigue Index based on RSI variation (CNS Fatigue Detection)
FATIGUE_RSI_THRESHOLDS = {
    "green": {"min": -5, "max": 100, "status_pt": "Treino Normal", "status_en": "Normal Training", "color": "#10b981"},
    "yellow": {"min": -12, "max": -5.01, "status_pt": "Monitorar Volume/Carga de Sprints", "status_en": "Monitor Volume/Sprint Load", "color": "#f59e0b"},
    "red": {"min": -100, "max": -12.01, "status_pt": "Alto Risco de Lesao - Reduzir Carga", "status_en": "High Injury Risk - Reduce Load", "color": "#ef4444"}
}


def classify_rsi(rsi: float) -> str:
    """Classify RSImod based on CMJ-specific reference values (McMahon et al., 2018)"""
    for classification, values in RSI_REFERENCES.items():
        if rsi >= values["min"]:
            return classification
    return "very_low"


def get_fatigue_status(rsi_variation_percent: float) -> dict:
    """Get fatigue status based on RSI variation from baseline"""
    for status, thresholds in FATIGUE_RSI_THRESHOLDS.items():
        if thresholds["min"] <= rsi_variation_percent <= thresholds["max"]:
            return {
                "status": status,
                "status_pt": thresholds["status_pt"],
                "status_en": thresholds["status_en"],
                "color": thresholds["color"]
            }
    return {
        "status": "green",
        "status_pt": FATIGUE_RSI_THRESHOLDS["green"]["status_pt"],
        "status_en": FATIGUE_RSI_THRESHOLDS["green"]["status_en"],
        "color": FATIGUE_RSI_THRESHOLDS["green"]["color"]
    }


def calculate_z_score(current_value: float, historical_values: List[float]) -> float:
    """
    Calculate Z-Score comparing current value with historical mean
    Z = (X - mu) / sigma
    """
    if len(historical_values) < 2:
        return 0
    mean = sum(historical_values) / len(historical_values)
    variance = sum((x - mean) ** 2 for x in historical_values) / len(historical_values)
    std_dev = math.sqrt(variance)
    if std_dev == 0:
        return 0
    z_score = (current_value - mean) / std_dev
    return round(z_score, 2)


def calculate_limb_asymmetry(right_value: float, left_value: float) -> dict:
    """
    Calculate limb asymmetry percentage
    Asymmetry > 10% is considered a Red Flag
    """
    if right_value == 0 and left_value == 0:
        return {"asymmetry_percent": 0, "dominant_leg": "equal", "red_flag": False}
    
    max_val = max(right_value, left_value)
    min_val = min(right_value, left_value)
    
    asymmetry = ((max_val - min_val) / max_val) * 100 if max_val > 0 else 0
    dominant = "right" if right_value > left_value else "left" if left_value > right_value else "equal"
    
    return {
        "asymmetry_percent": round(asymmetry, 1),
        "dominant_leg": dominant,
        "red_flag": asymmetry > 10
    }


def get_fatigue_interpretation(rsi_variation: float, lang: str) -> str:
    """Get interpretation text for fatigue based on RSI variation"""
    if rsi_variation >= -5:
        return "Sistema nervoso central recuperado. Treino normal permitido." if lang == "pt" else "Central nervous system recovered. Normal training permitted."
    elif rsi_variation >= -12:
        return "Possivel fadiga do SNC detectada. Monitorar volume de sprints e exercicios de alta velocidade." if lang == "pt" else "Possible CNS fatigue detected. Monitor sprint volume and high-speed exercises."
    else:
        return "Fadiga significativa do SNC. Alto risco de lesao. Reduzir carga ou individualizar treino." if lang == "pt" else "Significant CNS fatigue. High injury risk. Reduce load or individualize training."


def get_z_score_interpretation(z_score: float, lang: str) -> str:
    """Get interpretation text for Z-Score"""
    if z_score >= 1.5:
        return "Performance significativamente acima da media historica!" if lang == "pt" else "Performance significantly above historical average!"
    elif z_score >= 0.5:
        return "Performance acima da media historica." if lang == "pt" else "Performance above historical average."
    elif z_score >= -0.5:
        return "Performance dentro da media historica." if lang == "pt" else "Performance within historical average."
    elif z_score >= -1.5:
        return "Performance abaixo da media historica. Monitorar recuperacao." if lang == "pt" else "Performance below historical average. Monitor recovery."
    else:
        return "Performance significativamente abaixo da media. Investigar causas." if lang == "pt" else "Performance significantly below average. Investigate causes."


def get_asymmetry_interpretation(asymmetry: dict, lang: str) -> str:
    """Get interpretation text for limb asymmetry"""
    if not asymmetry["red_flag"]:
        return "Simetria entre membros dentro dos limites aceitaveis." if lang == "pt" else "Limb symmetry within acceptable limits."
    else:
        dominant = "direita" if asymmetry["dominant_leg"] == "right" else "esquerda"
        dominant_en = asymmetry["dominant_leg"]
        if lang == "pt":
            return f"RED FLAG: Assimetria de {asymmetry['asymmetry_percent']:.1f}% detectada. Perna {dominant} dominante. Risco aumentado de lesao. Recomenda-se trabalho de correcao."
        else:
            return f"RED FLAG: {asymmetry['asymmetry_percent']:.1f}% asymmetry detected. {dominant_en.capitalize()} leg dominant. Increased injury risk. Corrective work recommended."


def get_power_velocity_profile(power_vs_avg: float, velocity_vs_avg: float, lang: str) -> dict:
    """Determine training profile based on power-velocity relationship"""
    if power_vs_avg < -10 and velocity_vs_avg >= 0:
        return {
            "type": "velocity_dominant",
            "label": "Dominante em Velocidade" if lang == "pt" else "Velocity Dominant",
            "recommendation": "Priorizar treino de Forca Maxima (cargas >85% 1RM)" if lang == "pt" else "Prioritize Maximum Strength training (loads >85% 1RM)",
            "color": "#3b82f6"
        }
    elif power_vs_avg >= 0 and velocity_vs_avg < -10:
        return {
            "type": "power_dominant",
            "label": "Dominante em Potencia" if lang == "pt" else "Power Dominant",
            "recommendation": "Priorizar treino de Potencia/Velocidade (Pliometricos, Sprints)" if lang == "pt" else "Prioritize Power/Velocity training (Plyometrics, Sprints)",
            "color": "#f59e0b"
        }
    elif power_vs_avg >= 0 and velocity_vs_avg >= 0:
        return {
            "type": "balanced",
            "label": "Perfil Equilibrado" if lang == "pt" else "Balanced Profile",
            "recommendation": "Manter equilibrio entre forca, potencia e velocidade" if lang == "pt" else "Maintain balance between strength, power and velocity",
            "color": "#10b981"
        }
    else:
        return {
            "type": "development",
            "label": "Em Desenvolvimento" if lang == "pt" else "In Development",
            "recommendation": "Programa completo de forca e condicionamento recomendado" if lang == "pt" else "Complete strength and conditioning program recommended",
            "color": "#6366f1"
        }


def generate_jump_recommendations(analysis: dict, lang: str) -> List[str]:
    """Generate actionable recommendations based on jump analysis"""
    recommendations = []
    
    cmj_data = analysis.get("protocols", {}).get("cmj", {})
    if cmj_data:
        latest = cmj_data.get("latest", {})
        rsi = latest.get("rsi", 0)
        
        if rsi < 0.40:
            if lang == "pt":
                recommendations.append("RSImod muito baixo (<0.40). Focar em desenvolvimento de forca base e potencia. Limitar exercicios explosivos de alta intensidade.")
            else:
                recommendations.append("Very low RSImod (<0.40). Focus on base strength and power development. Limit high-intensity explosive exercises.")
        elif rsi < 0.60:
            if lang == "pt":
                recommendations.append("RSImod moderado. Continuar desenvolvendo capacidade de producao rapida de forca com pliometricos progressivos.")
            else:
                recommendations.append("Moderate RSImod. Continue developing rapid force production capacity with progressive plyometrics.")
    
    fatigue = analysis.get("fatigue_analysis", {})
    if fatigue:
        status = fatigue.get("status", "green")
        if status == "red":
            if lang == "pt":
                recommendations.append("ALERTA: Fadiga do SNC detectada (variacao >13%). Reduzir carga de treino imediatamente. Priorizar sono e recuperacao. Considerar treino individualizado.")
            else:
                recommendations.append("ALERT: CNS fatigue detected (>13% variation). Reduce training load immediately. Prioritize sleep and recovery. Consider individualized training.")
        elif status == "yellow":
            if lang == "pt":
                recommendations.append("MONITORAR: Sinais de fadiga. Reduzir volume de sprints e exercicios de alta velocidade nos proximos dias.")
            else:
                recommendations.append("MONITOR: Fatigue signs detected. Reduce sprint volume and high-speed exercises in coming days.")
    
    asymmetry = analysis.get("asymmetry", {})
    if asymmetry and asymmetry.get("red_flag"):
        percent = asymmetry.get("rsi", {}).get("asymmetry_percent", 0)
        if lang == "pt":
            recommendations.append(f"Assimetria significativa ({percent:.1f}%) detectada. Incluir exercicios unilaterais corretivos focando no membro nao-dominante.")
        else:
            recommendations.append(f"Significant asymmetry ({percent:.1f}%) detected. Include corrective unilateral exercises focusing on non-dominant limb.")
    
    pv_profile = analysis.get("power_velocity_insights", {}).get("profile", {})
    if pv_profile:
        rec = pv_profile.get("recommendation", "")
        if rec:
            recommendations.append(rec)
    
    z_score = analysis.get("z_score", {})
    if z_score and z_score.get("jump_height", 0) < -1.5:
        if lang == "pt":
            recommendations.append("Performance significativamente abaixo da media historica. Investigar: qualidade do sono, estresse, nutricao, sobrecarga de treino.")
        else:
            recommendations.append("Performance significantly below historical average. Investigate: sleep quality, stress, nutrition, training overload.")
    
    if not recommendations:
        if lang == "pt":
            recommendations.append("Atleta em boas condicoes. Continuar com protocolo de treino atual.")
        else:
            recommendations.append("Athlete in good condition. Continue with current training protocol.")
    
    return recommendations
