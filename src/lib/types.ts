export type Role = "ouder" | "kind";

export type PlanningType = "huiswerk" | "toets" | "prive" | "leermoment";
export type PlanningStatus = "voorstel" | "open" | "klaar";
export type MaterialBron = "tekst" | "pdf" | "foto";
export type RoosterType = "school" | "anders";
export type UitzonderingType = "vervallen" | "gewijzigd" | "extra";
export type JaarEventType = "vakantie" | "toetsweek" | "anders";

export interface Profile {
  id: string;
  family_id: string;
  role: Role;
  full_name: string;
  created_at: string;
}

export interface Family {
  id: string;
  name: string;
  reistijd_minuten: number;
  created_at: string;
}

export interface Subject {
  id: string;
  family_id: string;
  name: string;
  code: string | null;
  icon: string;
  color: string;
  ai_instructions: string;
  created_by: string;
  created_at: string;
}

export interface Material {
  id: string;
  family_id: string;
  subject_id: string;
  title: string;
  content: string;
  file_url: string | null;
  hoofdstuk: string | null;
  opdrachten: string | null;
  image_path: string | null;
  bron_type: MaterialBron;
  uploaded_by: string;
  uploaded_by_role: Role;
  created_at: string;
}

export interface TestType {
  id: string;
  family_id: string;
  name: string;
  dagen_van_tevoren: number;
  aantal_leermomenten: number;
  created_by: string;
  created_at: string;
}

export interface RoosterPeriode {
  id: string;
  family_id: string;
  naam: string;
  start_datum: string;
  eind_datum: string;
  created_by: string;
  created_at: string;
}

export interface RoosterItem {
  id: string;
  family_id: string;
  periode_id: string;
  subject_id: string | null;
  dag_van_week: number; // 1 = maandag ... 7 = zondag
  start_tijd: string; // "HH:MM:SS"
  eind_tijd: string;
  titel: string;
  type: RoosterType;
  created_by: string;
  created_at: string;
}

export interface RoosterUitzondering {
  id: string;
  family_id: string;
  datum: string;
  origineel_item_id: string | null;
  type: UitzonderingType;
  titel: string | null;
  subject_id: string | null;
  start_tijd: string | null;
  eind_tijd: string | null;
  created_by: string;
  created_at: string;
}

export interface JaarEvent {
  id: string;
  family_id: string;
  titel: string;
  start_datum: string;
  eind_datum: string;
  type: JaarEventType;
  created_by: string;
  created_at: string;
}

export interface PlanningItem {
  id: string;
  family_id: string;
  subject_id: string | null;
  parent_item_id: string | null;
  test_type_id: string | null;
  type: PlanningType;
  title: string;
  description: string;
  start_date: string | null;
  due_date: string;
  start_time: string | null;
  status: PlanningStatus;
  estimated_minutes: number | null;
  created_by: string;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  family_id: string;
  subject_id: string;
  user_id: string;
  role: "user" | "model";
  content: string;
  created_at: string;
}

export type Leerfase = "eerste" | "tussentijds" | "laatste";

export interface OverhoorSessie {
  id: string;
  family_id: string;
  user_id: string;
  subject_id: string;
  leerfase: Leerfase;
  aantal_goed: number;
  aantal_deels: number;
  aantal_fout: number;
  created_at: string;
}

export type Stemming = "goed" | "neutraal" | "moeilijk";

export interface WeekTerugblik {
  id: string;
  family_id: string;
  user_id: string;
  week_start: string;
  stemming: Stemming;
  created_at: string;
}
