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
  fatigue_index: number | null;
  fatigue_status: string;
  readiness_status: string;
  weight: number | null;
  body_fat: number | null;
  lean_mass: number | null;
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
  | 'body_fat';

export type SortDir = 'asc' | 'desc';
