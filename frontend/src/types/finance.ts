export interface MonthlySummary {
  month: string; // "YYYY-MM"
  income: string;
  expenses: string;
  profit: string;
  kaspi_balance_end: string | null;
  halyk_balance_end: string | null;
  cash_balance_end: string | null;
}

export interface DailySummary {
  date: string; // "YYYY-MM-DD"
  income: string;
  expenses: string;
  profit: string;
  total_balance_end: string | null;
}

export interface ExpenseCategory {
  category: string;
  total_amount: string;
  percentage: number;
}

export interface DailyBalance {
  date: string; // "YYYY-MM-DD"
  kaspi: string | null;
  halyk: string | null;
  cash: string | null;
  total: string | null;
}

// ── DailyReport (input/output) ─────────────────────────────────────────────

export type AccountSlug = "kaspi_pay" | "halyk" | "cash";
export type Direction   = "income" | "expense";

export interface ReportTransaction {
  id?: number;
  account: AccountSlug;
  direction: Direction;
  amount: string;
  comment: string;
  row_order: number;
  // Source of the row: "manual" (or null for legacy) is editable;
  // "excel"/"macdent" are imported and read-only. Set by the server on GET.
  source?: string | null;
}

export interface ReportOpeningBalances {
  kaspi_pay: string;
  halyk: string;
  cash: string;
}

export interface DailyReportResponse {
  date: string;
  exists: boolean;
  is_closed: boolean;
  closed_by: string | null;
  closed_at: string | null;
  notes: string;
  transactions: ReportTransaction[];
  opening_balances: ReportOpeningBalances;
}

export interface DailyReportSavePayload {
  date: string;
  // Only editable (manual) rows are sent; the server always stores them as
  // "manual", so source is intentionally excluded from the payload.
  transactions: Omit<ReportTransaction, "id" | "source">[];
  opening_balances: ReportOpeningBalances;
  notes: string;
}

export interface DoctorRevenueStats {
  doctor_id: number;
  doctor_name: string;
  revenue_total: string;
  days_worked: number;
  revenue_per_day: string;
  share_percent: number;
  kpi_threshold: string;
}

export interface PayrollCalculation {
  id: number;
  staff_member_id: number;
  staff_member_name: string;
  period: string;
  revenue_total: string;
  kpi_threshold: string;
  rate_below_kpi: string;
  rate_above_kpi: string;
  amount_below_kpi: string;
  amount_above_kpi: string;
  payroll_total: string;
  is_confirmed: boolean;
  confirmed_by_name: string | null;
  confirmed_at: string | null;
  notes: string;
}
