import axios from "axios";
import type { PaginatedResponse, StaffMember } from "../types/staff";

const api = axios.create({
  baseURL: "/api/v1",
});

export async function fetchStaff(): Promise<StaffMember[]> {
  const { data } = await api.get<PaginatedResponse<StaffMember>>("/staff/");
  return data.results;
}
