import { api } from "./client";
import type { SchedulerSnapshot } from "../types/scheduler";

export async function fetchSchedulerState(): Promise<SchedulerSnapshot | null> {
  const { status, data } = await api.get<SchedulerSnapshot | null>(
    "/scheduler/state/",
  );
  if (status === 204) return null;
  return data;
}

export async function saveSchedulerState(
  payload: SchedulerSnapshot,
): Promise<void> {
  await api.put("/scheduler/state/", payload);
}
