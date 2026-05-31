export interface SalaryRule {
  base_rate: string;
  elevated_rate: string;
  revenue_threshold: string;
  deduct_implant: boolean;
  deduct_lab: boolean;
}

export interface StaffMember {
  id: number;
  clinic: number;
  name: string;
  role: "doctor" | "anesthesiologist";
  color: string;
  is_active: boolean;
  salary_rule: SalaryRule | null;
  created_at: string;
  updated_at: string;
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}
