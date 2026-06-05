import { api } from "./client";
import type {
  DailyBalance,
  DailyReportResponse,
  DailyReportSavePayload,
  DailySummary,
  ExpenseCategory,
  MonthlySummary,
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
