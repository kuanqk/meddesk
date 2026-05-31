import axios from "axios";

const api = axios.create({
  baseURL: "/api/v1",
});

export interface SchedulerSnapshot {
  people: Record<string, unknown>[];
  schedule: Record<string, Record<string, { room: number | null; hours: number[] }>>;
  expenses: {
    rent: number;
    marketing: number;
    materials: number;
    other: number;
    anesthesia_pct: number;
  };
  sel_id?: string | null;
}

export async function fetchSchedulerState(): Promise<SchedulerSnapshot | null> {
  const { status, data } = await api.get<SchedulerSnapshot | null>("/scheduler/state/");
  if (status === 204) return null;
  return data;
}

export async function saveSchedulerState(payload: SchedulerSnapshot): Promise<void> {
  await api.put("/scheduler/state/", payload);
}
