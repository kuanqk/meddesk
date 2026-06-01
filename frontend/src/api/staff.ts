import { api } from "./client";
import type { PaginatedResponse, StaffMember } from "../types/staff";

export async function fetchStaff(): Promise<StaffMember[]> {
  const { data } = await api.get<PaginatedResponse<StaffMember>>("/staff/");
  return data.results;
}
