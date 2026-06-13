export interface StaffMember {
  id: number;
  clinic: number;
  name: string;
  role: "doctor" | "anesthesiologist";
  color: string;
  is_active: boolean;
  // KPI fields are present only for the owner (server hides them otherwise).
  kpi_threshold?: string;
  rate_below_kpi?: string;
  rate_above_kpi?: string;
  created_at: string;
  updated_at: string;
}

export interface SalaryPreview {
  staff_id: number;
  revenue: string;
  below: string;
  above: string;
  salary: string;
}

export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}
