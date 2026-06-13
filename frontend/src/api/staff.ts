import { api } from "./client";
import type { PaginatedResponse, SalaryPreview, StaffMember } from "../types/staff";

export async function fetchStaff(): Promise<StaffMember[]> {
  const { data } = await api.get<PaginatedResponse<StaffMember>>("/staff/");
  return data.results;
}

// Owner-only: previews KPI-based salary for a hypothetical monthly revenue.
// Returns 403 for non-owners.
export async function fetchSalaryPreview(
  staffId: number | string,
  revenue: number,
): Promise<SalaryPreview> {
  const { data } = await api.get<SalaryPreview>(`/staff/${staffId}/salary-preview/`, {
    params: { revenue },
  });
  return data;
}
