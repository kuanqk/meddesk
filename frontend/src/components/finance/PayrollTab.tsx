import { useCallback, useEffect, useMemo, useState } from "react";
import { calculatePayroll, confirmPayroll, fetchPayroll, unconfirmPayroll } from "../../api/finance";
import type { PayrollCalculation } from "../../types/finance";
import { useAuth } from "../../context/AuthContext";

// ── design tokens (same as FinancePage) ───────────────────────────────────────
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

function fmtFull(v: number): string {
  return new Intl.NumberFormat("ru-KZ").format(Math.round(v));
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-");
  const names = ["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];
  return `${names[parseInt(m) - 1]} ${y}`;
}

// ── KPI progress bar ───────────────────────────────────────────────────────────
function KpiProgress({ revenue, threshold }: { revenue: number; threshold: number }) {
  const ratio = threshold > 0 ? Math.min(revenue / threshold, 1) : (revenue > 0 ? 1 : 0);
  const pct = ratio * 100;
  const color = pct >= 100 ? C.green : pct >= 75 ? C.amber : C.red;
  const bg = pct >= 100 ? C.greenBg : pct >= 75 ? C.amberBg : C.redBg;
  return (
    <div>
      <div style={{ height: 8, background: bg, borderRadius: 4, overflow: "hidden", border: `1px solid ${C.border}` }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 4, transition: "width 0.4s" }} />
      </div>
      <div style={{ fontSize: 10, color, fontWeight: 600, marginTop: 3 }}>
        {pct.toFixed(0)}%
      </div>
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────
export default function PayrollTab() {
  const { user } = useAuth();
  const isOwner = !!user && (user.is_superuser || user.role === "owner");
  const canCalculate = isOwner || user?.role === "admin";

  const [month, setMonth] = useState(currentMonth());
  const [rows, setRows] = useState<PayrollCalculation[]>([]);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  const [confirmingId, setConfirmingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchPayroll(month)
      .then(setRows)
      .catch(() => setError("Ошибка загрузки ФОТ"))
      .finally(() => setLoading(false));
  }, [month]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCalculate = async () => {
    setCalculating(true);
    setError(null);
    try {
      const data = await calculatePayroll(month);
      setRows(data);
    } catch {
      setError("Не удалось рассчитать ФОТ");
    } finally {
      setCalculating(false);
    }
  };

  const handleConfirm = async (id: number) => {
    setConfirmingId(id);
    setError(null);
    try {
      const updated = await confirmPayroll(id);
      setRows(prev => prev.map(r => (r.id === id ? updated : r)));
    } catch {
      setError("Не удалось подтвердить расчёт");
    } finally {
      setConfirmingId(null);
    }
  };

  const handleUnconfirm = async (id: number) => {
    setConfirmingId(id);
    setError(null);
    try {
      const updated = await unconfirmPayroll(id);
      setRows(prev => prev.map(r => (r.id === id ? updated : r)));
    } catch {
      setError("Не удалось снять подтверждение");
    } finally {
      setConfirmingId(null);
    }
  };

  const grandTotal = useMemo(
    () => rows.reduce((s, r) => s + n(r.payroll_total), 0),
    [rows],
  );

  const TH: React.CSSProperties = {
    padding: "8px 12px", textAlign: "right", color: C.textMuted, fontWeight: 600,
    textTransform: "uppercase", letterSpacing: 0.6, fontSize: 10,
    borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap",
  };
  const TD: React.CSSProperties = {
    padding: "10px 12px", textAlign: "right", fontSize: 12, borderBottom: `1px solid ${C.border}`,
  };

  return (
    <div>
      {/* ── CONTROLS ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, color: C.textMuted, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>
          Месяц:
        </span>
        <input
          type="month"
          value={month}
          onChange={e => setMonth(e.target.value)}
          style={{
            background: C.surface, border: `1px solid ${C.border2}`, borderRadius: 8,
            padding: "6px 12px", fontSize: 13, fontFamily: "inherit", color: C.text, cursor: "pointer",
          }}
        />
        <span style={{ fontSize: 12, color: C.textMuted }}>{monthLabel(month)}</span>

        {canCalculate && (
          <button
            onClick={handleCalculate}
            disabled={calculating}
            style={{
              marginLeft: "auto",
              background: calculating ? C.border : C.accent,
              color: "#fff", border: "none", borderRadius: 8,
              padding: "8px 18px", fontSize: 13, fontWeight: 600,
              cursor: calculating ? "default" : "pointer", fontFamily: "inherit",
            }}
          >
            {calculating ? "Расчёт…" : "↻ Рассчитать"}
          </button>
        )}
      </div>

      {error && (
        <div style={{ background: C.redBg, border: `1px solid #fecaca`, borderRadius: 10, padding: "12px 16px", marginBottom: 20, color: C.red, fontSize: 13 }}>
          ⚠️ {error}
        </div>
      )}

      {/* ── TABLE ── */}
      <div style={{ ...card, padding: 0, overflow: "hidden" }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: C.textSub }}>Загрузка…</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", color: C.textMuted, fontSize: 13 }}>
            Нет расчётов за {monthLabel(month)}.
            {canCalculate && " Нажмите «Рассчитать», чтобы сформировать ФОТ."}
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#fafaf9" }}>
                  <th style={{ ...TH, textAlign: "left" }}>Врач</th>
                  <th style={TH}>Выручка</th>
                  <th style={TH}>KPI порог</th>
                  <th style={{ ...TH, textAlign: "left", minWidth: 120 }}>Прогресс KPI</th>
                  <th style={TH}>Ставка</th>
                  <th style={TH}>ФОТ итого</th>
                  <th style={{ ...TH, textAlign: "center" }}>Статус</th>
                  <th style={{ ...TH, textAlign: "center" }}>Подтвердить</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const rev = n(r.revenue_total);
                  const kpi = n(r.kpi_threshold);
                  const exceeded = rev >= kpi;
                  return (
                    <tr key={r.id} style={{ background: i % 2 === 0 ? "#fff" : "#fafaf9" }}>
                      <td style={{ ...TD, textAlign: "left", fontWeight: 600 }}>{r.staff_member_name}</td>
                      <td style={{ ...TD, color: C.green, fontWeight: 600 }}>{fmtFull(rev)}</td>
                      <td style={{ ...TD, color: C.textSub }}>{fmtFull(kpi)}</td>
                      <td style={{ ...TD, textAlign: "left" }}>
                        <KpiProgress revenue={rev} threshold={kpi} />
                      </td>
                      <td style={{ ...TD, color: C.textSub }}>
                        {n(r.rate_below_kpi)}% / {n(r.rate_above_kpi)}%
                        {exceeded && <span style={{ color: C.green, marginLeft: 4 }}>↑</span>}
                      </td>
                      <td style={{ ...TD, fontWeight: 800, color: C.text }}>{fmtFull(n(r.payroll_total))}</td>
                      <td style={{ ...TD, textAlign: "center" }}>
                        {r.is_confirmed ? (
                          <span title={r.confirmed_by_name ? `${r.confirmed_by_name}` : undefined}
                            style={{ display: "inline-block", background: C.greenBg, color: C.green, border: `1px solid #bbf7d0`, borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 600 }}>
                            ✓ Подтверждён
                          </span>
                        ) : (
                          <span style={{ display: "inline-block", background: C.amberBg, color: C.amber, border: `1px solid #fde68a`, borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 600 }}>
                            Черновик
                          </span>
                        )}
                      </td>
                      <td style={{ ...TD, textAlign: "center" }}>
                        {!isOwner ? (
                          <span style={{ color: C.textMuted, fontSize: 11 }}>—</span>
                        ) : r.is_confirmed ? (
                          <button
                            onClick={() => handleUnconfirm(r.id)}
                            disabled={confirmingId === r.id}
                            title="Снять подтверждение, чтобы пересчитать"
                            style={{
                              background: "#fff", color: C.textSub, border: `1px solid ${C.border2}`, borderRadius: 6,
                              padding: "5px 12px", fontSize: 12, fontWeight: 600,
                              cursor: confirmingId === r.id ? "default" : "pointer", fontFamily: "inherit",
                            }}
                          >
                            {confirmingId === r.id ? "…" : "Снять"}
                          </button>
                        ) : (
                          <button
                            onClick={() => handleConfirm(r.id)}
                            disabled={confirmingId === r.id}
                            style={{
                              background: confirmingId === r.id ? C.border : C.green,
                              color: "#fff", border: "none", borderRadius: 6,
                              padding: "5px 12px", fontSize: 12, fontWeight: 600,
                              cursor: confirmingId === r.id ? "default" : "pointer", fontFamily: "inherit",
                            }}
                          >
                            {confirmingId === r.id ? "…" : "Подтвердить"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: "#fafaf9", borderTop: `2px solid ${C.border2}` }}>
                  <td style={{ ...TD, textAlign: "left", fontWeight: 700 }} colSpan={5}>Итого ФОТ</td>
                  <td style={{ ...TD, fontWeight: 800, color: C.accent }}>{fmtFull(grandTotal)} тг</td>
                  <td style={TD} colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
