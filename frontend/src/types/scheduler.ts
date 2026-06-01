export interface SchedulerSnapshot {
  people: Record<string, unknown>[];
  schedule: Record<
    string,
    Record<string, { room: number | null; hours: number[] }>
  >;
  expenses: {
    rent: number;
    marketing: number;
    materials: number;
    other: number;
    anesthesia_pct: number;
  };
  sel_id?: string | null;
}
