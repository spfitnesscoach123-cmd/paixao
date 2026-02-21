export interface User {
  id: string;
  email: string;
  name: string;
  role?: 'coach' | 'athlete'; // Papel do usuário no sistema
  created_at: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface Athlete {
  id?: string;
  coach_id?: string;
  name: string;
  birth_date: string;
  position: string;
  height?: number;
  weight?: number;
  photo_base64?: string;
  created_at?: string;
  updated_at?: string;
}

export interface GPSData {
  id?: string;
  athlete_id: string;
  coach_id?: string;
  date: string;
  session_id?: string;
  session_name?: string;
  period_name?: string;
  activity_type?: string; // "game" or "training"
  total_distance: number;
  high_intensity_distance: number; // HID 14.4-19.8 km/h
  high_speed_running?: number; // HSR 19.8-25.2 km/h
  sprint_distance: number; // 25.3+ km/h
  number_of_sprints: number;
  number_of_accelerations: number;
  number_of_decelerations: number;
  max_speed?: number;
  max_acceleration?: number;
  max_deceleration?: number;
  notes?: string;
  created_at?: string;
}

export interface WellnessQuestionnaire {
  id?: string;
  athlete_id: string;
  coach_id?: string;
  date: string;
  fatigue: number;
  stress: number;
  mood: number;
  sleep_quality: number;
  sleep_hours: number;
  muscle_soreness: number;
  hydration: number;
  wellness_score?: number;
  readiness_score?: number;
  notes?: string;
  created_at?: string;
}

export interface PhysicalAssessment {
  id?: string;
  athlete_id: string;
  coach_id?: string;
  date: string;
  assessment_type: 'strength' | 'aerobic' | 'body_composition';
  metrics: Record<string, any>;
  notes?: string;
  created_at?: string;
}

export interface ACWRAnalysis {
  acute_load: number;
  chronic_load: number;
  acwr_ratio: number;
  risk_level: 'low' | 'optimal' | 'moderate' | 'high';
  recommendation: string;
}

export interface FatigueAnalysis {
  fatigue_level: 'low' | 'moderate' | 'high' | 'critical';
  fatigue_score: number;
  contributing_factors: string[];
  recommendation: string;
}

export interface AIInsights {
  summary: string;
  strengths: string[];
  concerns: string[];
  recommendations: string[];
  training_zones: Record<string, string>;
}

export interface ComprehensiveAnalysis {
  athlete_id: string;
  athlete_name: string;
  analysis_date: string;
  acwr?: ACWRAnalysis;
  fatigue?: FatigueAnalysis;
  ai_insights?: AIInsights;
}
