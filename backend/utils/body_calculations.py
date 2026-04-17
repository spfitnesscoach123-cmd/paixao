import math


def calculate_body_density_pollock_jackson_7(gender: str, age: int, skinfolds: dict) -> float:
    """
    Pollock & Jackson 7 Skinfold Protocol
    Males: chest, midaxillary, triceps, subscapular, abdominal, suprailiac, thigh
    Females: triceps, thigh, suprailiac, abdominal, chest, midaxillary, subscapular
    """
    sum_7 = (
        skinfolds.get('chest', 0) +
        skinfolds.get('midaxillary', 0) +
        skinfolds.get('triceps', 0) +
        skinfolds.get('subscapular', 0) +
        skinfolds.get('abdominal', 0) +
        skinfolds.get('suprailiac', 0) +
        skinfolds.get('thigh', 0)
    )
    
    if gender.lower() == 'male':
        density = 1.112 - (0.00043499 * sum_7) + (0.00000055 * sum_7**2) - (0.00028826 * age)
    else:
        density = 1.097 - (0.00046971 * sum_7) + (0.00000056 * sum_7**2) - (0.00012828 * age)
    
    return density


def calculate_body_density_pollock_jackson_9(gender: str, age: int, skinfolds: dict) -> float:
    """
    Pollock & Jackson 9 Skinfold Protocol (more comprehensive)
    All 9 sites: chest, midaxillary, triceps, subscapular, abdominal, suprailiac, thigh, biceps, calf
    """
    sum_9 = (
        skinfolds.get('chest', 0) +
        skinfolds.get('midaxillary', 0) +
        skinfolds.get('triceps', 0) +
        skinfolds.get('subscapular', 0) +
        skinfolds.get('abdominal', 0) +
        skinfolds.get('suprailiac', 0) +
        skinfolds.get('thigh', 0) +
        skinfolds.get('biceps', 0) +
        skinfolds.get('calf', 0)
    )
    
    if gender.lower() == 'male':
        density = 1.1125 - (0.0004 * sum_9) + (0.0000005 * sum_9**2) - (0.00029 * age)
    else:
        density = 1.099 - (0.00043 * sum_9) + (0.00000054 * sum_9**2) - (0.00013 * age)
    
    return density


def calculate_body_density_jackson_pollock_3(gender: str, age: int, skinfolds: dict) -> float:
    """Jackson & Pollock 3 Skinfold Protocol. Males: chest, abdominal, thigh. Females: triceps, suprailiac, thigh."""
    if gender.lower() == 'male':
        s = skinfolds.get('chest', 0) + skinfolds.get('abdominal', 0) + skinfolds.get('thigh', 0)
        return 1.10938 - 0.0008267 * s + 0.0000016 * s**2 - 0.0002574 * age
    else:
        s = skinfolds.get('triceps', 0) + skinfolds.get('suprailiac', 0) + skinfolds.get('thigh', 0)
        return 1.0994921 - 0.0009929 * s + 0.0000023 * s**2 - 0.0001392 * age


def calculate_body_density_durnin_womersley(gender: str, age: int, skinfolds: dict) -> float:
    """Durnin & Womersley 4 Skinfold Protocol (1974). Sites: biceps, triceps, subscapular, suprailiac."""
    s = skinfolds.get('biceps', 0) + skinfolds.get('triceps', 0) + skinfolds.get('subscapular', 0) + skinfolds.get('suprailiac', 0)
    log_s = math.log10(max(s, 1))
    if gender.lower() == 'male':
        if age < 20: return 1.1620 - 0.0630 * log_s
        elif age < 30: return 1.1631 - 0.0632 * log_s
        elif age < 40: return 1.1422 - 0.0544 * log_s
        elif age < 50: return 1.1620 - 0.0700 * log_s
        else: return 1.1715 - 0.0779 * log_s
    else:
        if age < 20: return 1.1549 - 0.0678 * log_s
        elif age < 30: return 1.1599 - 0.0717 * log_s
        elif age < 40: return 1.1423 - 0.0632 * log_s
        elif age < 50: return 1.1333 - 0.0612 * log_s
        else: return 1.1339 - 0.0645 * log_s


def calculate_body_density_guedes(gender: str, skinfolds: dict) -> float:
    """
    Guedes Protocol (1985) - Brazilian validated protocol
    Males: triceps, suprailiac, abdominal
    Females: triceps, suprailiac, thigh
    """
    if gender.lower() == 'male':
        sum_3 = (
            skinfolds.get('triceps', 0) +
            skinfolds.get('suprailiac', 0) +
            skinfolds.get('abdominal', 0)
        )
        if sum_3 > 0:
            density = 1.1714 - (0.0671 * math.log10(sum_3))
        else:
            density = 1.0
    else:
        sum_3 = (
            skinfolds.get('triceps', 0) +
            skinfolds.get('suprailiac', 0) +
            skinfolds.get('thigh', 0)
        )
        if sum_3 > 0:
            density = 1.1665 - (0.0706 * math.log10(sum_3))
        else:
            density = 1.0
    
    return density


def calculate_body_fat_faulkner(skinfolds: dict) -> float:
    """
    Faulkner 4 Skinfold Protocol (1968)
    Used for athletes, especially swimmers
    Sites: triceps, subscapular, suprailiac, abdominal
    """
    sum_4 = (
        skinfolds.get('triceps', 0) +
        skinfolds.get('subscapular', 0) +
        skinfolds.get('suprailiac', 0) +
        skinfolds.get('abdominal', 0)
    )
    
    body_fat = (sum_4 * 0.153) + 5.783
    return body_fat


def siri_equation(density: float) -> float:
    """Convert body density to body fat percentage using Siri equation (1961)"""
    return (495 / density) - 450


def calculate_bmi(weight_kg: float, height_cm: float) -> tuple:
    """Calculate BMI and return classification"""
    height_m = height_cm / 100
    bmi = weight_kg / (height_m ** 2)
    
    if bmi < 18.5:
        classification = "underweight"
    elif bmi < 25:
        classification = "normal"
    elif bmi < 30:
        classification = "overweight"
    elif bmi < 35:
        classification = "obese_class_1"
    elif bmi < 40:
        classification = "obese_class_2"
    else:
        classification = "obese_class_3"
    
    return round(bmi, 2), classification


def estimate_bone_mass(weight_kg: float, height_cm: float, gender: str) -> float:
    """Estimate bone mass using Martin formula approximation"""
    base_factor = 0.035 if gender.lower() == 'male' else 0.030
    bone_mass = weight_kg * base_factor * (height_cm / 170)
    return round(bone_mass, 2)


def calculate_fat_distribution(skinfolds: dict) -> dict:
    """
    Calculate fat distribution for 3D body visualization
    Returns normalized percentages for different body regions
    """
    total = sum(v for v in skinfolds.values() if v)
    if total == 0:
        return {}
    
    distribution = {}
    regions = {
        'upper_arm': ['triceps', 'biceps'],
        'trunk_front': ['chest', 'abdominal'],
        'trunk_back': ['subscapular', 'midaxillary'],
        'hip_waist': ['suprailiac'],
        'lower_body': ['thigh', 'calf']
    }
    
    for region, sites in regions.items():
        region_sum = sum(skinfolds.get(site, 0) for site in sites)
        distribution[region] = round((region_sum / total) * 100, 1) if total > 0 else 0
    
    return distribution


def get_bmi_classification_text(classification: str, lang: str = 'pt') -> str:
    """Get BMI classification text in specified language"""
    classifications = {
        'pt': {
            'underweight': 'Abaixo do peso',
            'normal': 'Peso normal',
            'overweight': 'Sobrepeso',
            'obese_class_1': 'Obesidade Grau I',
            'obese_class_2': 'Obesidade Grau II',
            'obese_class_3': 'Obesidade Grau III'
        },
        'en': {
            'underweight': 'Underweight',
            'normal': 'Normal weight',
            'overweight': 'Overweight',
            'obese_class_1': 'Obesity Class I',
            'obese_class_2': 'Obesity Class II',
            'obese_class_3': 'Obesity Class III'
        }
    }
    return classifications.get(lang, classifications['pt']).get(classification, classification)
