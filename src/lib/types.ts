export type Role = "ouder" | "kind";

export type PlanningType = "huiswerk" | "toets" | "prive" | "leermoment";
export type PlanningStatus = "voorstel" | "open" | "klaar";

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
  created_at: string;
}

export interface Subject {
  id: string;
  family_id: string;
  name: string;
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
  uploaded_by: string;
  uploaded_by_role: Role;
  created_at: string;
}

export interface PlanningItem {
  id: string;
  family_id: string;
  subject_id: string | null;
  parent_item_id: string | null;
  type: PlanningType;
  title: string;
  description: string;
  start_date: string | null;
  due_date: string;
  status: PlanningStatus;
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
