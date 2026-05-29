export interface TeamTableRowData {
  athlete_id: string;
  name: string;
  position: string;
  total_distance: number;
  z3: number;
  z4: number;
  z5: number;
  sprint_count: number;
  acc_dec: number;
  rsimod: number | null;
  rsimod_delta: number | null;
  rsimod_baseline_28d: number | null;
  fatigue_index: number | null;
  fatigue_baseline_28d: number | null;
  fatigue_status: string;
  readiness_score: number | null;
  readiness_status: string;
  pain_score: number | null;
  pain_location: string | null;
  weight: number | null;
  body_fat: number | null;
  lean_mass: number | null;
  avg_player_load: number | null;
  player_load_per_min: number | null;
  max_velocity_percent: number | null;
  max_velocity_kmh: number | null;
  max_acceleration: number | null;
  max_deceleration: number | null;
  high_metabolic_load: number | null;
  duration: number | null;
}

export type SortKey =
  | 'name'
  | 'total_distance'
  | 'z3'
  | 'z4'
  | 'z5'
  | 'sprint_count'
  | 'acc_dec'
  | 'rsimod'
  | 'fatigue_index'
  | 'avg_player_load'
  | 'player_load_per_min'
  | 'max_velocity_percent'
  | 'max_velocity_kmh'
  | 'max_acceleration'
  | 'max_deceleration'
  | 'high_metabolic_load'
  | 'duration'
  | 'body_fat';

export type SortDir = 'asc' | 'desc';
