import { api } from "./client";
import type {
  DailyBalance,
  DailyReportResponse,
  DailyReportSavePayload,
  DailySummary,
  ExpenseCategory,
  DoctorRevenueStats,
  MonthlySummary,
  PayrollCalculation,
} from "../types/finance";

export async function fetchSummary(from: string, to: string): Promise<MonthlySummary[]> {
  const { data } = await api.get<MonthlySummary[]>("/finance/summary/", {
    params: { from, to },
  });
  return data;
}

export async function fetchDaily(from: string, to: string): Promise<DailySummary[]> {
  const { data } = await api.get<DailySummary[]>("/finance/daily/", {
    params: { from, to },
  });
  return data;
}

export async function fetchExpenses(from: string, to: string): Promise<ExpenseCategory[]> {
  const { data } = await api.get<ExpenseCategory[]>("/finance/expenses/", {
    params: { from, to },
  });
  return data;
}

export async function fetchBalances(from: string, to: string): Promise<DailyBalance[]> {
  const { data } = await api.get<DailyBalance[]>("/finance/balances/", {
    params: { from, to },
  });
  return data;
}

export async function fetchDailyReport(date: string): Promise<DailyReportResponse> {
  const { data } = await api.get<DailyReportResponse>("/finance/daily-report/", {
    params: { date },
  });
  return data;
}

export async function saveDailyReport(
  payload: DailyReportSavePayload,
): Promise<DailyReportResponse> {
  const { data } = await api.post<DailyReportResponse>("/finance/daily-report/", payload);
  return data;
}

export async function closeDailyReport(date: string): Promise<DailyReportResponse> {
  const { data } = await api.post<DailyReportResponse>("/finance/daily-report/close/", { date });
  return data;
}

export async function reopenDailyReport(date: string): Promise<DailyReportResponse> {
  const { data } = await api.post<DailyReportResponse>("/finance/daily-report/reopen/", { date });
  return data;
}

export async function fetchClosedDates(month: string): Promise<string[]> {
  const { data } = await api.get<string[]>("/finance/daily-report/closed-dates/", {
    params: { month },
  });
  return data;
}

/** Скачивает XLSX с доходом врачей за указанный период. */
export async function downloadDoctorsRevenueXlsx(from: string, to: string): Promise<void> {
  const response = await api.get("/finance/doctors-revenue/export/", {
    params: { from, to },
    responseType: "blob",
  });
  const url = window.URL.createObjectURL(response.data as Blob);
  const link = document.createElement("a");
  link.href = url;
  const disposition = response.headers["content-disposition"] as string | undefined;
  const match = disposition?.match(/filename="?([^"]+)"?/);
  link.download = match?.[1] ?? `doctors_revenue_${from}_${to}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export async function fetchDoctorsRevenue(from: string, to: string): Promise<DoctorRevenueStats[]> {
  const { data } = await api.get<DoctorRevenueStats[]>("/finance/doctors-revenue/", {
    params: { from, to },
  });
  return data;
}

export interface ExcelImportResult {
  dry_run: boolean;
  imported_days: number;
  imported_dates: string[];
  date_range: [string, string] | null;
  transactions_saved: number;
  skipped_days: number;
  skipped: { date: string; reason: string }[];
}

/** Загружает квартальный xlsx кассовой книги и импортирует новые дни. */
export async function importExcel(file: File, dryRun = false): Promise<ExcelImportResult> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post<ExcelImportResult>("/finance/import-excel/", form, {
    params: dryRun ? { dry_run: 1 } : undefined,
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

/** Скачивает XLSX со сводкой доходов кассы. from/to (YYYY-MM) опциональны —
 * без них выгружается вся история. */
export async function downloadIncomeXlsx(from?: string, to?: string): Promise<void> {
  const response = await api.get("/finance/income/export/", {
    params: from && to ? { from, to } : undefined,
    responseType: "blob",
  });
  const url = window.URL.createObjectURL(response.data as Blob);
  const link = document.createElement("a");
  link.href = url;
  const disposition = response.headers["content-disposition"] as string | undefined;
  const match = disposition?.match(/filename="?([^"]+)"?/);
  link.download = match?.[1] ?? "income_by_month.xlsx";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export async function fetchPayroll(month: string): Promise<PayrollCalculation[]> {
  const { data } = await api.get<PayrollCalculation[]>("/finance/payroll/", {
    params: { month },
  });
  return data;
}

export async function calculatePayroll(month: string): Promise<PayrollCalculation[]> {
  const { data } = await api.post<PayrollCalculation[]>("/finance/payroll/calculate/", { month });
  return data;
}

export async function confirmPayroll(id: number): Promise<PayrollCalculation> {
  const { data } = await api.post<PayrollCalculation>(`/finance/payroll/${id}/confirm/`, {});
  return data;
}

export async function unconfirmPayroll(id: number): Promise<PayrollCalculation> {
  const { data } = await api.post<PayrollCalculation>(`/finance/payroll/${id}/unconfirm/`, {});
  return data;
}
