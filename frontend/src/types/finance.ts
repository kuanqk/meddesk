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
