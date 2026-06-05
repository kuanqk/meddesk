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
  notes: string;
  transactions: ReportTransaction[];
  opening_balances: ReportOpeningBalances;
}

export interface DailyReportSavePayload {
  date: string;
  transactions: Omit<ReportTransaction, "id">[];
  opening_balances: ReportOpeningBalances;
  notes: string;
}
