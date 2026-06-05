import { api } from "./client";
import type { DailyBalance, DailySummary, ExpenseCategory, MonthlySummary } from "../types/finance";

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
