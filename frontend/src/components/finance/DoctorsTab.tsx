import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchDoctorsRevenue } from "../../api/finance";
import type { DoctorRevenueStats } from "../../types/finance";

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

function firstDayOfMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function lastDayOfMonth(): string {
  const d = new Date();
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}`;
}

// ── main component ────────────────────────────────────────────────────────────
export default function DoctorsTab() {
  const [from, setFrom] = useState(firstDayOfMonth());
  const [to, setTo] = useState(lastDayOfMonth());
  const [rows, setRows] = useState<DoctorRevenueStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchDoctorsRevenue(from, to)
      .then(setRows)
      .catch(() => setError("Ошибка загрузки данных по врачам"))
      .finally(() => setLoading(false));
  }, [from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const grandTotal = useMemo(
    () => rows.reduce((s, r) => s + n(r.revenue_total), 0),
    [rows],
  );
  const totalDays = useMemo(
    () => rows.reduce((s, r) => s + r.days_worked, 0),
    [rows],
  );
  const maxShare = useMemo(
    () => Math.max(...rows.map(r => r.share_percent), 1),
    [rows],
  );

  const inputStyle: React.CSSProperties = {
    background: C.surface, border: `1px solid ${C.border2}`, borderRadius: 8,
    padding: "6px 12px", fontSize: 13, fontFamily: "inherit", color: C.text, cursor: "pointer",
  };

  return (
    <div>
      {/* ── DATE RANGE ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, color: C.textMuted, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>
          Период:
        </span>
        <input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)} style={inputStyle} />
        <span style={{ color: C.textMuted }}>—</span>
        <input type="date" value={to} min={from} onChange={e => setTo(e.target.value)} style={inputStyle} />
      </div>

      {error && (
        <div style={{ background: C.redBg, border: `1px solid #fecaca`, borderRadius: 10, padding: "12px 16px", marginBottom: 20, color: C.red, fontSize: 13 }}>
          ⚠️ {error}
        </div>
      )}

      <div style={{ ...card, padding: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>Выручка по врачам</span>
          <span style={{ fontSize: 11, color: C.textMuted }}>{rows.length} врачей</span>
        </div>

        {loading ? (
          <div style={{ padding: 30, textAlign: "center", color: C.textSub }}>Загрузка…</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 30, textAlign: "center", color: C.textMuted, fontSize: 13 }}>
            Нет данных за выбранный период.
          </div>
        ) : (
          <>
            {rows.map(r => {
              const rev = n(r.revenue_total);
              const kpi = n(r.kpi_threshold);
              const reachedKpi = kpi > 0 && rev >= kpi;
              const barColor = reachedKpi ? C.green : C.amber;
              const barW = (r.share_percent / maxShare) * 100;
              return (
                <div key={r.doctor_id} style={{ marginBottom: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5 }}>
                    <span style={{ fontWeight: 600, color: C.text, fontSize: 13 }}>
                      {r.doctor_name}
                      {reachedKpi && <span style={{ color: C.green, marginLeft: 6, fontSize: 11 }}>✓ KPI</span>}
                    </span>
                    <span style={{ fontSize: 12, color: C.textSub }}>
                      <b style={{ color: C.text }}>{fmtFull(rev)} тг</b>
                      <span style={{ color: C.textMuted, marginLeft: 8 }}>· {r.days_worked} дн.</span>
                      <span style={{ color: C.textMuted, marginLeft: 8 }}>· {fmtFull(n(r.revenue_per_day))}/дн</span>
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ flex: 1, height: 18, background: C.bg, borderRadius: 5, overflow: "hidden", border: `1px solid ${C.border}` }}>
                      <div style={{ height: "100%", width: `${barW}%`, background: barColor, borderRadius: 4, transition: "width 0.4s", minWidth: barW > 0 ? 2 : 0 }} />
                    </div>
                    <span style={{ fontSize: 11, color: C.textSub, fontWeight: 600, width: 44, textAlign: "right" }}>
                      {r.share_percent.toFixed(1)}%
                    </span>
                  </div>
                </div>
              );
            })}

            {/* legend */}
            <div style={{ display: "flex", gap: 16, marginTop: 4, fontSize: 10, color: C.textSub }}>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ width: 10, height: 10, background: C.green, borderRadius: 2, display: "inline-block" }} />
                KPI достигнут
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ width: 10, height: 10, background: C.amber, borderRadius: 2, display: "inline-block" }} />
                Ниже KPI
              </span>
            </div>

            {/* total row */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 18, paddingTop: 14, borderTop: `1.5px solid ${C.border2}` }}>
              <span style={{ fontWeight: 700, color: C.text, fontSize: 13 }}>
                Итого выручка
                <span style={{ color: C.textMuted, fontWeight: 400, marginLeft: 8, fontSize: 12 }}>· {totalDays} чел-дней</span>
              </span>
              <span style={{ fontWeight: 800, color: C.accent, fontSize: 15 }}>{fmtFull(grandTotal)} тг</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
