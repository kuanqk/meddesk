import { useEffect, useState, useMemo } from "react";
import { fetchSummary, fetchExpenses, fetchBalances } from "../api/finance";
import type { MonthlySummary, ExpenseCategory, DailyBalance } from "../types/finance";
import { useAuth } from "../context/AuthContext";
import DailyInputTab from "../components/finance/DailyInputTab";
import PayrollTab from "../components/finance/PayrollTab";
import DoctorsTab from "../components/finance/DoctorsTab";

type FinanceTab = "overview" | "input" | "payroll" | "doctors";

// ── design tokens (same as ClinicScheduler) ───────────────────────────────────
const C = {
  bg: "#f5f5f0",
  surface: "#ffffff",
  border: "#e5e3dd",
  border2: "#d1cec6",
  text: "#1a1814",
  textSub: "#6b6760",
  textMuted: "#9e9b93",
  accent: "#2563eb",
  accentBg: "#eff6ff",
  green: "#16a34a",
  greenBg: "#f0fdf4",
  red: "#dc2626",
  redBg: "#fef2f2",
  amber: "#b45309",
  amberBg: "#fffbeb",
  teal: "#0891b2",
  tealBg: "#ecfeff",
  shadow: "0 1px 3px rgba(0,0,0,0.07), 0 1px 2px rgba(0,0,0,0.04)",
};
const card = {
  background: C.surface,
  border: `1px solid ${C.border}`,
  borderRadius: 12,
  boxShadow: C.shadow,
};

// ── helpers ───────────────────────────────────────────────────────────────────
function n(v: string | null | undefined): number {
  if (v == null) return 0;
  return parseFloat(v) || 0;
}

function fmt(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(0)}k`;
  return String(Math.round(v));
}

function fmtFull(v: number): string {
  return new Intl.NumberFormat("ru-KZ").format(Math.round(v));
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-");
  const names = ["Янв","Фев","Мар","Апр","Май","Июн","Июл","Авг","Сен","Окт","Ноя","Дек"];
  return `${names[parseInt(m) - 1]} ${y.slice(2)}`;
}

/** Returns "YYYY-MM" for N months ago */
function monthsAgo(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ── sub-components ────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, color, bg, border,
}: {
  label: string; value: string; sub?: string;
  color: string; bg: string; border: string;
}) {
  return (
    <div style={{ ...card, background: bg, border: `1px solid ${border}`, padding: "16px 20px", flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 10, color: C.textMuted, textTransform: "uppercase", letterSpacing: 1.2, fontWeight: 600, marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color, letterSpacing: -0.5 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: C.textMuted, marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

/** Pure-CSS vertical bar chart for monthly income vs expenses */
function BarChart({ months }: { months: MonthlySummary[] }) {
  if (!months.length) return null;

  const maxVal = Math.max(...months.flatMap(m => [n(m.income), n(m.expenses)]), 1);
  const barH = 140;

  return (
    <div style={{ overflowX: "auto" }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 6, minWidth: months.length * 56, paddingBottom: 4 }}>
        {months.map(m => {
          const inc = n(m.income);
          const exp = n(m.expenses);
          const pro = n(m.profit);
          const incH = Math.round((inc / maxVal) * barH);
          const expH = Math.round((exp / maxVal) * barH);
          const isLoss = pro < 0;
          return (
            <div key={m.month} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0, flex: 1, minWidth: 48 }}>
              {/* profit label */}
              <div style={{ fontSize: 9, fontWeight: 700, color: isLoss ? C.red : C.green, marginBottom: 2, whiteSpace: "nowrap" }}>
                {isLoss ? "-" : "+"}{fmt(Math.abs(pro))}
              </div>
              {/* bars */}
              <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: barH }}>
                <div
                  title={`Выручка: ${fmtFull(inc)} тг`}
                  style={{ width: 18, height: incH, background: "#3b82f6", borderRadius: "3px 3px 0 0", transition: "height 0.3s" }}
                />
                <div
                  title={`Расходы: ${fmtFull(exp)} тг`}
                  style={{ width: 18, height: expH, background: "#fca5a5", borderRadius: "3px 3px 0 0", transition: "height 0.3s" }}
                />
              </div>
              {/* label */}
              <div style={{ fontSize: 9, color: C.textMuted, marginTop: 4, textAlign: "center", whiteSpace: "nowrap" }}>
                {monthLabel(m.month)}
              </div>
            </div>
          );
        })}
      </div>
      {/* legend */}
      <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 10, color: C.textSub }}>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 10, height: 10, background: "#3b82f6", borderRadius: 2, display: "inline-block" }} />
          Выручка
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 10, height: 10, background: "#fca5a5", borderRadius: 2, display: "inline-block" }} />
          Расходы
        </span>
      </div>
    </div>
  );
}

/** Small sparkline bars for last N days of balance */
function Sparkline({ values }: { values: number[] }) {
  if (!values.length) return null;
  const max = Math.max(...values, 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 1, height: 24, marginTop: 4 }}>
      {values.map((v, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            height: Math.max(2, Math.round((v / max) * 24)),
            background: "#3b82f6",
            opacity: 0.5 + 0.5 * (i / values.length),
            borderRadius: 1,
          }}
        />
      ))}
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────

const PERIODS = [
  { label: "3 мес", months: 3 },
  { label: "6 мес", months: 6 },
  { label: "1 год", months: 12 },
];

export default function FinancePage({ onBack }: { onBack: () => void }) {
  const { logout } = useAuth();
  const [activeTab, setActiveTab] = useState<FinanceTab>("overview");
  const [period, setPeriod] = useState(6);
  const [summary, setSummary] = useState<MonthlySummary[]>([]);
  const [expenses, setExpenses] = useState<ExpenseCategory[]>([]);
  const [balances, setBalances] = useState<DailyBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fromMonth = monthsAgo(period - 1);
  const toMonth = currentMonth();

  // last 30 days for balance sparklines
  const today = new Date();
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(today.getDate() - 29);
  const balFrom = `${thirtyDaysAgo.getFullYear()}-${String(thirtyDaysAgo.getMonth() + 1).padStart(2, "0")}-${String(thirtyDaysAgo.getDate()).padStart(2, "0")}`;
  const balTo = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      fetchSummary(fromMonth, toMonth),
      fetchExpenses(fromMonth, toMonth),
      fetchBalances(balFrom, balTo),
    ])
      .then(([s, e, b]) => {
        setSummary(s);
        setExpenses(e);
        setBalances(b);
      })
      .catch(() => setError("Ошибка загрузки данных"))
      .finally(() => setLoading(false));
  }, [period]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── derived stats ──────────────────────────────────────────────────────────
  const totals = useMemo(() => {
    const income = summary.reduce((s, m) => s + n(m.income), 0);
    const exp = summary.reduce((s, m) => s + n(m.expenses), 0);
    return { income, expenses: exp, profit: income - exp };
  }, [summary]);

  const latestBalance = useMemo(() => {
    if (!balances.length) return null;
    return balances[balances.length - 1];
  }, [balances]);

  const totalLatestBalance = latestBalance
    ? (n(latestBalance.kaspi) + n(latestBalance.halyk) + n(latestBalance.cash))
    : null;

  // sparkline data per account (last 30 days)
  const sparklines = useMemo(() => {
    return {
      kaspi: balances.map(b => n(b.kaspi)),
      halyk: balances.map(b => n(b.halyk)),
      cash: balances.map(b => n(b.cash)),
    };
  }, [balances]);

  // top expenses — from expense transactions (top 15 by amount, use expenses endpoint)
  const topExpenses = useMemo(() => {
    return [...expenses].sort((a, b) => n(b.total_amount) - n(a.total_amount));
  }, [expenses]);

  // ── render ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", color: C.textSub, fontFamily: "'Inter','Segoe UI',sans-serif" }}>
        Загрузка финансов…
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "'Inter','Segoe UI',sans-serif", fontSize: 13 }}>

      {/* ── HEADER ── */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 11, color: C.accent, letterSpacing: 2, textTransform: "uppercase", fontWeight: 600, marginBottom: 4 }}>
            Стоматологическая клиника
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.5 }}>Финансы · Аналитика</div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button
            onClick={onBack}
            style={{ background: C.accentBg, border: `1px solid #bfdbfe`, borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 600, color: C.accent, cursor: "pointer", fontFamily: "inherit" }}
          >
            📅 Расписание
          </button>
          <button
            onClick={logout}
            style={{ background: "#fff", border: `1px solid ${C.border2}`, borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 600, color: C.textSub, cursor: "pointer", fontFamily: "inherit" }}
          >
            Выйти
          </button>
        </div>
      </div>

      {/* ── TAB BAR ── */}
      <div style={{ background: C.surface, borderBottom: `1px solid ${C.border}`, padding: "0 24px", display: "flex", gap: 2 }}>
        {([
          { id: "overview", label: "📊 Обзор" },
          { id: "input",    label: "📝 Ввод дня" },
          { id: "payroll",  label: "💰 ФОТ" },
          { id: "doctors",  label: "🩺 Врачи" },
        ] as { id: FinanceTab; label: string }[]).map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            style={{
              background: "transparent", border: "none",
              borderBottom: activeTab === t.id ? `2px solid ${C.accent}` : "2px solid transparent",
              color: activeTab === t.id ? C.accent : C.textSub,
              padding: "10px 18px", cursor: "pointer", fontSize: 13,
              fontFamily: "inherit", fontWeight: activeTab === t.id ? 600 : 400,
              transition: "all 0.15s",
            }}
          >{t.label}</button>
        ))}
      </div>

      <div style={{ padding: 24 }}>

        {/* ── DAILY INPUT TAB ── */}
        {activeTab === "input" && (
          <DailyInputTab />
        )}

        {/* ── PAYROLL TAB ── */}
        {activeTab === "payroll" && (
          <PayrollTab />
        )}

        {/* ── DOCTORS TAB ── */}
        {activeTab === "doctors" && (
          <DoctorsTab />
        )}

        {activeTab === "overview" && (
          <>{/* ── PERIOD SELECTOR ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 24 }}>
          <span style={{ fontSize: 11, color: C.textMuted, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", marginRight: 4 }}>
            Период:
          </span>
          {PERIODS.map(p => (
            <button
              key={p.months}
              onClick={() => setPeriod(p.months)}
              style={{
                background: period === p.months ? C.accent : C.surface,
                color: period === p.months ? "#fff" : C.textSub,
                border: `1px solid ${period === p.months ? C.accent : C.border2}`,
                borderRadius: 20,
                padding: "5px 16px",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600,
                fontFamily: "inherit",
                transition: "all 0.15s",
              }}
            >
              {p.label}
            </button>
          ))}
          <span style={{ fontSize: 12, color: C.textMuted, marginLeft: 8 }}>
            {monthLabel(fromMonth)} — {monthLabel(toMonth)}
          </span>
        </div>

        {error && (
          <div style={{ background: C.redBg, border: `1px solid #fecaca`, borderRadius: 10, padding: "12px 16px", marginBottom: 20, color: C.red, fontSize: 13 }}>
            ⚠️ {error}
          </div>
        )}

        {/* ── KPI CARDS ── */}
        <div style={{ display: "flex", gap: 16, marginBottom: 24 }}>
          <KpiCard
            label="Выручка"
            value={`${fmt(totals.income)} тг`}
            sub={`${fmtFull(totals.income)} тг`}
            color={C.green} bg={C.greenBg} border="#bbf7d0"
          />
          <KpiCard
            label="Расходы"
            value={`${fmt(totals.expenses)} тг`}
            sub={`${fmtFull(totals.expenses)} тг`}
            color={C.red} bg={C.redBg} border="#fecaca"
          />
          <KpiCard
            label="Прибыль"
            value={`${totals.profit >= 0 ? "+" : ""}${fmt(totals.profit)} тг`}
            sub={`${fmtFull(totals.profit)} тг`}
            color={totals.profit >= 0 ? C.green : C.red}
            bg={totals.profit >= 0 ? C.greenBg : C.redBg}
            border={totals.profit >= 0 ? "#bbf7d0" : "#fecaca"}
          />
          <KpiCard
            label="Остаток на счетах"
            value={totalLatestBalance != null ? `${fmt(totalLatestBalance)} тг` : "—"}
            sub={totalLatestBalance != null ? `${fmtFull(totalLatestBalance)} тг` : undefined}
            color={C.teal} bg={C.tealBg} border="#a5f3fc"
          />
        </div>

        {/* ── TWO COLUMN LAYOUT ── */}
        <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>

          {/* ── LEFT: chart + accounts ── */}
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 20 }}>

            {/* Monthly bar chart */}
            <div style={{ ...card, padding: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>Выручка / Расходы по месяцам</span>
                <span style={{ fontSize: 11, color: C.textMuted }}>
                  Маржа: {totals.income > 0 ? (totals.profit / totals.income * 100).toFixed(1) : "0"}%
                </span>
              </div>
              <BarChart months={summary} />
              {/* Monthly P&L mini table */}
              {summary.length > 0 && (
                <div style={{ marginTop: 16, overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                    <thead>
                      <tr style={{ background: "#fafaf9" }}>
                        {["Месяц", "Выручка", "Расходы", "Прибыль", "Маржа"].map(h => (
                          <th key={h} style={{ padding: "6px 10px", textAlign: h === "Месяц" ? "left" : "right", color: C.textMuted, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6, borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" }}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[...summary].reverse().map((m, i) => {
                        const inc = n(m.income);
                        const exp = n(m.expenses);
                        const pro = inc - exp;
                        const margin = inc > 0 ? (pro / inc * 100).toFixed(1) : "—";
                        return (
                          <tr key={m.month} style={{ background: i % 2 === 0 ? "#fff" : "#fafaf9", borderBottom: `1px solid ${C.border}` }}>
                            <td style={{ padding: "7px 10px", fontWeight: 600 }}>{monthLabel(m.month)}</td>
                            <td style={{ padding: "7px 10px", textAlign: "right", color: C.green, fontWeight: 600 }}>{fmtFull(inc)}</td>
                            <td style={{ padding: "7px 10px", textAlign: "right", color: C.red }}>{fmtFull(exp)}</td>
                            <td style={{ padding: "7px 10px", textAlign: "right", color: pro >= 0 ? C.green : C.red, fontWeight: 700 }}>
                              {pro >= 0 ? "+" : ""}{fmtFull(pro)}
                            </td>
                            <td style={{ padding: "7px 10px", textAlign: "right", color: pro >= 0 ? C.green : C.red }}>
                              {margin !== "—" ? `${margin}%` : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Account balance cards */}
            <div style={{ display: "flex", gap: 14 }}>
              {[
                { label: "Каспи pay", key: "kaspi" as const, color: "#f59e0b", bg: "#fffbeb", border: "#fde68a" },
                { label: "Halyk bank", key: "halyk" as const, color: C.green, bg: C.greenBg, border: "#bbf7d0" },
                { label: "Наличные", key: "cash" as const, color: C.accent, bg: C.accentBg, border: "#bfdbfe" },
              ].map(acc => {
                const current = latestBalance ? n(latestBalance[acc.key]) : null;
                return (
                  <div key={acc.key} style={{ ...card, flex: 1, padding: "14px 16px", borderLeft: `3px solid ${acc.color}` }}>
                    <div style={{ fontSize: 11, color: C.textMuted, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>
                      {acc.label}
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: acc.color }}>
                      {current != null ? `${fmt(current)} тг` : "—"}
                    </div>
                    {current != null && (
                      <div style={{ fontSize: 10, color: C.textMuted }}>{fmtFull(current)} тг</div>
                    )}
                    <Sparkline values={sparklines[acc.key]} />
                  </div>
                );
              })}
            </div>

          </div>

          {/* ── RIGHT: expense categories ── */}
          <div style={{ width: 340, flexShrink: 0, display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ ...card, padding: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 16 }}>Расходы по категориям</div>

              {topExpenses.length === 0 && (
                <div style={{ color: C.textMuted, fontSize: 12, textAlign: "center", padding: "20px 0" }}>Нет данных</div>
              )}

              {topExpenses.map(cat => {
                const pct = cat.percentage;
                return (
                  <div key={cat.category} style={{ marginBottom: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontWeight: 600, color: C.text, fontSize: 12 }}>{cat.category}</span>
                      <span style={{ fontSize: 12, color: C.textSub }}>{fmtFull(n(cat.total_amount))} тг</span>
                    </div>
                    <div style={{ height: 6, background: C.border, borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${Math.min(pct, 100)}%`, background: C.accent, borderRadius: 3, transition: "width 0.4s" }} />
                    </div>
                    <div style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>{pct.toFixed(1)}%</div>
                  </div>
                );
              })}
            </div>

            {/* Summary totals box */}
            <div style={{ ...card, padding: 16, background: "#fafaf9" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.textSub, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 12 }}>
                Итого за период
              </div>
              {[
                { label: "Выручка", value: totals.income, color: C.green },
                { label: "Расходы", value: -totals.expenses, color: C.red },
                { label: "Прибыль", value: totals.profit, color: totals.profit >= 0 ? C.green : C.red, bold: true },
              ].map(row => (
                <div key={row.label} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderTop: row.bold ? `1.5px solid ${C.border2}` : "none", marginTop: row.bold ? 6 : 0 }}>
                  <span style={{ color: C.textSub, fontWeight: row.bold ? 700 : 400 }}>{row.label}</span>
                  <span style={{ color: row.color, fontWeight: row.bold ? 700 : 500 }}>
                    {row.value < 0 ? "−" : ""}{fmtFull(Math.abs(row.value))} тг
                  </span>
                </div>
              ))}
              {totals.income > 0 && (
                <div style={{ marginTop: 10, background: totals.profit >= 0 ? C.greenBg : C.redBg, border: `1px solid ${totals.profit >= 0 ? "#bbf7d0" : "#fecaca"}`, borderRadius: 8, padding: "8px 12px", textAlign: "center", fontSize: 13, fontWeight: 700, color: totals.profit >= 0 ? C.green : C.red }}>
                  Маржа: {(totals.profit / totals.income * 100).toFixed(1)}%
                </div>
              )}
            </div>

          </div>
        </div>
        </>) /* end activeTab === "overview" */}
      </div>
    </div>
  );
}
