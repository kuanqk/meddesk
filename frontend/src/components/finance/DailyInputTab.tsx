/**
 * DailyInputTab — production daily cash-entry form replacing Excel.
 *
 * Architecture:
 *   Date navigator → Opening balances (read-only) →
 *   3 × AccountSection (rows with direction/amount/comment) →
 *   Closing balances (computed) → Daily summary → Save bar
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type RefCallback,
} from "react";
import { fetchDailyReport, saveDailyReport } from "../../api/finance";
import type {
  AccountSlug,
  DailyReportSavePayload,
  Direction,
  ReportOpeningBalances,
} from "../../types/finance";

// ── design tokens ─────────────────────────────────────────────────────────────
const C = {
  bg: "#f5f5f0", surface: "#ffffff", border: "#e5e3dd", border2: "#d1cec6",
  text: "#1a1814", textSub: "#6b6760", textMuted: "#9e9b93",
  accent: "#2563eb", accentBg: "#eff6ff",
  green: "#16a34a", greenBg: "#f0fdf4",
  red: "#dc2626", redBg: "#fef2f2",
  amber: "#b45309", amberBg: "#fffbeb",
  shadow: "0 1px 3px rgba(0,0,0,0.07)",
};
const card = { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, boxShadow: C.shadow };

// ── constants ─────────────────────────────────────────────────────────────────
const ACCOUNTS: { slug: AccountSlug; label: string; color: string }[] = [
  { slug: "kaspi_pay", label: "Каспи pay",  color: "#f59e0b" },
  { slug: "halyk",     label: "Halyk bank", color: C.green  },
  { slug: "cash",      label: "Наличные",   color: C.accent },
];

const COMMENT_STORAGE_KEY = "meddesk_comment_history";
const MAX_HISTORY = 20;

// ── helpers ───────────────────────────────────────────────────────────────────
function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function shiftDate(dateStr: string, delta: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

/** Format raw numeric string as "1 234 500" */
function fmtAmount(raw: string): string {
  const n = parseFloat(raw.replace(/\s/g, ""));
  if (isNaN(n) || raw === "") return "";
  return new Intl.NumberFormat("ru-RU").format(n);
}

/** Parse display value back to plain number string */
function parseAmount(display: string): string {
  return display.replace(/\s/g, "").replace(",", ".");
}

function fmtFull(n: number): string {
  return new Intl.NumberFormat("ru-KZ").format(Math.round(n));
}

// ── comment history ───────────────────────────────────────────────────────────
function getHistory(): string[] {
  try { return JSON.parse(localStorage.getItem(COMMENT_STORAGE_KEY) ?? "[]"); }
  catch { return []; }
}
function addHistory(comment: string): void {
  if (!comment.trim()) return;
  const h = [comment, ...getHistory().filter(c => c !== comment)].slice(0, MAX_HISTORY);
  localStorage.setItem(COMMENT_STORAGE_KEY, JSON.stringify(h));
}

// ── Row state ─────────────────────────────────────────────────────────────────
interface TxRow {
  localId: string;
  direction: Direction;
  amount: string;   // raw digits string, e.g. "30150"
  comment: string;
}

type RowsByAccount = Record<AccountSlug, TxRow[]>;

function emptyRows(): RowsByAccount {
  return { kaspi_pay: [], halyk: [], cash: [] };
}

let _idCounter = 0;
function newId(): string {
  return `r${Date.now()}_${++_idCounter}`;
}

function emptyRow(direction: Direction = "income"): TxRow {
  return { localId: newId(), direction, amount: "", comment: "" };
}

// ── Toast ─────────────────────────────────────────────────────────────────────
interface Toast { id: string; message: string; type: "success" | "error" | "info" }

// ── mobile hook ───────────────────────────────────────────────────────────────
function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const h = () => setMobile(window.innerWidth < 768);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);
  return mobile;
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
function Skel({ w = "100%", h = 18 }: { w?: string | number; h?: number }) {
  return <div style={{ width: w, height: h, background: "#e8e6e1", borderRadius: 5, opacity: 0.8 }} />;
}

// ── AmountInput ───────────────────────────────────────────────────────────────
interface AmountInputProps {
  value: string;
  onChange: (raw: string) => void;
  onNegative?: () => void;
  inputRef?: RefCallback<HTMLInputElement>;
  onTab?: (e: KeyboardEvent<HTMLInputElement>) => void;
  disabled?: boolean;
  "aria-label"?: string;
}

function AmountInput({ value, onChange, onNegative, inputRef, onTab, disabled, "aria-label": ariaLabel }: AmountInputProps) {
  const [display, setDisplay] = useState(() => (value ? fmtAmount(value) : ""));
  const isFocused = useRef(false);

  // Sync display when value changes from outside (e.g. loaded from API)
  useEffect(() => {
    if (!isFocused.current) setDisplay(value ? fmtAmount(value) : "");
  }, [value]);

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="numeric"
      value={display}
      disabled={disabled}
      aria-label={ariaLabel ?? "Сумма"}
      placeholder="0"
      style={{
        width: "100%", background: C.bg, border: `1px solid ${C.border2}`,
        borderRadius: 7, padding: "7px 10px", fontSize: 13, color: C.text,
        fontFamily: "inherit", outline: "none", textAlign: "right",
        opacity: disabled ? 0.6 : 1,
      }}
      onFocus={() => {
        isFocused.current = true;
        setDisplay(value); // show raw on focus
      }}
      onBlur={() => {
        isFocused.current = false;
        const raw = parseAmount(display);
        const num = parseFloat(raw);
        if (isNaN(num) || raw === "") {
          setDisplay("");
          onChange("");
          return;
        }
        if (num < 0) {
          onNegative?.();
          const abs = String(Math.abs(num));
          onChange(abs);
          setDisplay(fmtAmount(abs));
        } else {
          onChange(String(num));
          setDisplay(fmtAmount(String(num)));
        }
      }}
      onChange={e => {
        const v = e.target.value;
        setDisplay(v);
        const raw = parseAmount(v);
        const num = parseFloat(raw);
        if (!isNaN(num)) onChange(raw);
        else if (v === "" || v === "-") onChange("");
      }}
      onKeyDown={e => {
        if (e.key === "Tab") onTab?.(e);
      }}
    />
  );
}

// ── CommentInput with autocomplete ────────────────────────────────────────────
interface CommentInputProps {
  value: string;
  onChange: (v: string) => void;
  onEnter?: () => void;
  onTab?: (e: KeyboardEvent<HTMLInputElement>) => void;
  inputRef?: RefCallback<HTMLInputElement>;
  disabled?: boolean;
  "aria-label"?: string;
}

function CommentInput({ value, onChange, onEnter, onTab, inputRef, disabled, "aria-label": ariaLabel }: CommentInputProps) {
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);

  const handleChange = (v: string) => {
    onChange(v);
    const h = getHistory();
    const s = v.trim()
      ? h.filter(c => c.toLowerCase().includes(v.toLowerCase()))
      : h;
    setSuggestions(s.slice(0, 5));
    setOpen(s.length > 0);
  };

  const pick = (s: string) => { onChange(s); setOpen(false); };

  // Close on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!wrapRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  return (
    <div ref={wrapRef} style={{ position: "relative", flex: 1 }}>
      <input
        ref={inputRef}
        type="text"
        value={value}
        disabled={disabled}
        aria-label={ariaLabel ?? "Комментарий"}
        aria-autocomplete="list"
        aria-expanded={open}
        placeholder="Комментарий"
        style={{
          width: "100%", background: C.bg, border: `1px solid ${C.border2}`,
          borderRadius: 7, padding: "7px 10px", fontSize: 13, color: C.text,
          fontFamily: "inherit", outline: "none", boxSizing: "border-box",
          opacity: disabled ? 0.6 : 1,
        }}
        onFocus={() => {
          const h = getHistory();
          const s = value.trim()
            ? h.filter(c => c.toLowerCase().includes(value.toLowerCase()))
            : h;
          if (s.length) { setSuggestions(s.slice(0, 5)); setOpen(true); }
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={e => handleChange(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter") { e.preventDefault(); onEnter?.(); }
          if (e.key === "Tab")   { onTab?.(e); }
          if (e.key === "Escape") setOpen(false);
        }}
      />
      {open && suggestions.length > 0 && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0, zIndex: 200,
          background: C.surface, border: `1px solid ${C.border2}`, borderRadius: 8,
          boxShadow: "0 4px 16px rgba(0,0,0,0.12)", overflow: "hidden", marginTop: 2,
        }}>
          {suggestions.map((s, i) => (
            <div key={i}
              role="option"
              onMouseDown={() => pick(s)}
              style={{
                padding: "8px 12px", fontSize: 12, cursor: "pointer",
                color: C.text, borderBottom: i < suggestions.length - 1 ? `1px solid ${C.border}` : "none",
              }}
              onMouseEnter={e => (e.currentTarget.style.background = C.accentBg)}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >{s}</div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── TransactionRow ────────────────────────────────────────────────────────────
interface TxRowProps {
  row: TxRow;
  rowIdx: number;
  accountSlug: AccountSlug;
  disabled: boolean;
  onUpdate: (patch: Partial<TxRow>) => void;
  onDelete: () => void;
  onEnterComment: () => void;
  onTabComment: (e: KeyboardEvent<HTMLInputElement>) => void;
  onTabAmount: (e: KeyboardEvent<HTMLInputElement>) => void;
  amountRef: RefCallback<HTMLInputElement>;
  commentRef: RefCallback<HTMLInputElement>;
}

function TransactionRow({
  row, rowIdx, accountSlug, disabled,
  onUpdate, onDelete, onEnterComment, onTabComment, onTabAmount,
  amountRef, commentRef,
}: TxRowProps) {
  const isIncome = row.direction === "income";
  return (
    <div
      role="row"
      style={{
        display: "flex", alignItems: "center", gap: 6, padding: "4px 0",
        borderBottom: `1px solid ${C.border}`,
      }}
    >
      {/* Row number */}
      <div style={{ width: 20, textAlign: "right", fontSize: 10, color: C.textMuted, flexShrink: 0 }}>
        {rowIdx + 1}
      </div>

      {/* Direction toggle */}
      <button
        type="button"
        aria-label={isIncome ? "Доход — нажмите для расхода" : "Расход — нажмите для дохода"}
        disabled={disabled}
        onClick={() => onUpdate({ direction: isIncome ? "expense" : "income" })}
        style={{
          width: 28, height: 28, borderRadius: 6, border: "none", cursor: disabled ? "not-allowed" : "pointer",
          background: isIncome ? C.greenBg : C.redBg,
          color: isIncome ? C.green : C.red,
          fontSize: 15, fontWeight: 800, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
          transition: "all 0.12s",
        }}
      >
        {isIncome ? "+" : "−"}
      </button>

      {/* Amount */}
      <div style={{ width: 120, flexShrink: 0 }}>
        <AmountInput
          value={row.amount}
          disabled={disabled}
          inputRef={amountRef}
          aria-label={`Сумма ${rowIdx + 1} ${accountSlug}`}
          onChange={raw => onUpdate({ amount: raw })}
          onNegative={() => onUpdate({ direction: "expense" })}
          onTab={onTabAmount}
        />
      </div>

      {/* Comment */}
      <CommentInput
        value={row.comment}
        disabled={disabled}
        inputRef={commentRef}
        aria-label={`Комментарий ${rowIdx + 1} ${accountSlug}`}
        onChange={v => onUpdate({ comment: v })}
        onEnter={onEnterComment}
        onTab={onTabComment}
      />

      {/* Delete */}
      <button
        type="button"
        aria-label="Удалить строку"
        disabled={disabled}
        onClick={() => {
          if (!row.amount || window.confirm("Удалить строку?")) onDelete();
        }}
        style={{
          width: 28, height: 28, borderRadius: 6, border: `1px solid ${C.border2}`,
          background: "transparent", cursor: disabled ? "not-allowed" : "pointer",
          color: C.textMuted, fontSize: 14, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        ×
      </button>
    </div>
  );
}

// ── AccountSection ────────────────────────────────────────────────────────────
interface AccountSectionProps {
  slug: AccountSlug;
  label: string;
  color: string;
  rows: TxRow[];
  disabled: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onAddRow: (afterIdx?: number) => void;
  onUpdateRow: (localId: string, patch: Partial<TxRow>) => void;
  onDeleteRow: (localId: string) => void;
  amountRefs: Map<string, HTMLInputElement>;
  commentRefs: Map<string, HTMLInputElement>;
  addBtnRef: RefCallback<HTMLButtonElement>;
  pendingFocus: React.MutableRefObject<{ account: AccountSlug; localId: string } | null>;
}

function AccountSection({
  slug, label, color, rows, disabled, collapsed,
  onToggleCollapse, onAddRow, onUpdateRow, onDeleteRow,
  amountRefs, commentRefs, addBtnRef, pendingFocus,
}: AccountSectionProps) {
  const income  = rows.filter(r => r.direction === "income").reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
  const expense = rows.filter(r => r.direction === "expense").reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
  const net = income - expense;

  const setAmountRef = useCallback((localId: string): RefCallback<HTMLInputElement> =>
    (el) => { if (el) amountRefs.set(localId, el); else amountRefs.delete(localId); },
    [amountRefs]);

  const setCommentRef = useCallback((localId: string): RefCallback<HTMLInputElement> =>
    (el) => { if (el) commentRefs.set(localId, el); else commentRefs.delete(localId); },
    [commentRefs]);

  // Focus management after render
  useEffect(() => {
    const pf = pendingFocus.current;
    if (pf && pf.account === slug) {
      amountRefs.get(pf.localId)?.focus();
      pendingFocus.current = null;
    }
  });

  const handleTabAmount = (rowIdx: number): ((e: KeyboardEvent<HTMLInputElement>) => void) =>
    (e) => {
      // Native Tab (amount → comment) — let it pass unless shift
      if (!e.shiftKey) return; // browser handles forward
      // Shift-Tab from amount: go to previous comment
      if (rowIdx > 0) {
        e.preventDefault();
        commentRefs.get(rows[rowIdx - 1].localId)?.focus();
      }
    };

  const handleTabComment = (rowIdx: number): ((e: KeyboardEvent<HTMLInputElement>) => void) =>
    (e) => {
      if (e.shiftKey) return; // browser handles shift-Tab to amount
      e.preventDefault();
      if (rowIdx + 1 < rows.length) {
        amountRefs.get(rows[rowIdx + 1].localId)?.focus();
      } else {
        // Find the add-row button via addBtnRef (stored externally)
        const btn = document.querySelector(`[data-add-btn="${slug}"]`) as HTMLButtonElement;
        btn?.focus();
      }
    };

  return (
    <div style={{ ...card, marginBottom: 12, overflow: "hidden" }}>
      {/* Section header */}
      <button
        type="button"
        aria-expanded={!collapsed}
        onClick={onToggleCollapse}
        style={{
          width: "100%", background: "transparent", border: "none", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "12px 16px", borderBottom: collapsed ? "none" : `1px solid ${C.border}`,
          borderLeft: `4px solid ${color}`, fontFamily: "inherit",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{label}</span>
          <span style={{ fontSize: 11, color: C.textMuted }}>{rows.length} строк</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {income > 0 && <span style={{ fontSize: 12, color: C.green, fontWeight: 600 }}>+{fmtFull(income)}</span>}
          {expense > 0 && <span style={{ fontSize: 12, color: C.red }}>−{fmtFull(expense)}</span>}
          <span style={{ fontSize: 12, fontWeight: 700, color: net >= 0 ? C.green : C.red }}>{fmtFull(net)}</span>
          <span style={{ fontSize: 12, color: C.textMuted }}>{collapsed ? "▶" : "▼"}</span>
        </div>
      </button>

      {!collapsed && (
        <div style={{ padding: "0 16px 12px" }}>
          {/* Column headers */}
          <div style={{ display: "flex", gap: 6, padding: "8px 0 4px", marginLeft: 26 }}>
            <div style={{ width: 28, flexShrink: 0 }} />
            <div style={{ width: 120, flexShrink: 0, fontSize: 10, color: C.textMuted, fontWeight: 600, textTransform: "uppercase", textAlign: "right" }}>Сумма</div>
            <div style={{ flex: 1, fontSize: 10, color: C.textMuted, fontWeight: 600, textTransform: "uppercase", paddingLeft: 10 }}>Комментарий</div>
          </div>

          {rows.length === 0 && (
            <div style={{ padding: "10px 0 4px", fontSize: 12, color: C.textMuted, fontStyle: "italic" }}>
              Нет строк. Нажмите «+ Добавить строку»
            </div>
          )}

          {rows.map((row, idx) => (
            <TransactionRow
              key={row.localId}
              row={row}
              rowIdx={idx}
              accountSlug={slug}
              disabled={disabled}
              onUpdate={patch => onUpdateRow(row.localId, patch)}
              onDelete={() => onDeleteRow(row.localId)}
              onEnterComment={() => {
                const newRow = emptyRow(row.direction);
                onAddRow(idx + 1);
                pendingFocus.current = { account: slug, localId: newRow.localId };
                // patch: the row that will be inserted
              }}
              onTabComment={handleTabComment(idx)}
              onTabAmount={handleTabAmount(idx)}
              amountRef={setAmountRef(row.localId)}
              commentRef={setCommentRef(row.localId)}
            />
          ))}

          <button
            ref={addBtnRef}
            data-add-btn={slug}
            type="button"
            disabled={disabled}
            onClick={() => onAddRow()}
            style={{
              marginTop: 8, background: "transparent", border: `1px dashed ${color}`,
              borderRadius: 7, padding: "6px 14px", cursor: disabled ? "not-allowed" : "pointer",
              fontSize: 12, color, fontWeight: 600, fontFamily: "inherit",
              opacity: disabled ? 0.6 : 1,
            }}
          >
            + Добавить строку
          </button>
        </div>
      )}
    </div>
  );
}

// ── BalancesRow ───────────────────────────────────────────────────────────────
function BalancesRow({
  label, values, loading, color = C.textSub,
}: {
  label: string;
  values: Record<AccountSlug, number | null>;
  loading?: boolean;
  color?: string;
}) {
  return (
    <div style={{ ...card, padding: "12px 16px", marginBottom: 12, display: "flex", alignItems: "center", gap: 16 }}>
      <div style={{ width: 120, flexShrink: 0, fontSize: 12, fontWeight: 700, color }}>{label}</div>
      {ACCOUNTS.map(acc => (
        <div key={acc.slug} style={{ flex: 1, textAlign: "right" }}>
          <div style={{ fontSize: 10, color: C.textMuted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 2 }}>
            {acc.label}
          </div>
          {loading
            ? <Skel h={16} />
            : <div style={{ fontSize: 14, fontWeight: 700, color: acc.color }}>
                {values[acc.slug] != null ? fmtFull(values[acc.slug]!) : "—"} тг
              </div>
          }
        </div>
      ))}
    </div>
  );
}

// ── Props ──────────────────────────────────────────────────────────────────────
export interface DailyInputTabProps {
  initialDate?: string; // YYYY-MM-DD
}

// ── Main component ────────────────────────────────────────────────────────────
export default function DailyInputTab({ initialDate }: DailyInputTabProps) {
  const isMobile = useIsMobile();

  // ── date ──────────────────────────────────────────────────────────────────
  const [date, setDate] = useState(initialDate ?? todayStr());

  // ── form state ─────────────────────────────────────────────────────────────
  const [rows, setRows] = useState<RowsByAccount>(emptyRows());
  const [opening, setOpening] = useState<ReportOpeningBalances>({ kaspi_pay: "0", halyk: "0", cash: "0" });
  const [notes, setNotes] = useState("");
  const [isClosed, setIsClosed] = useState(false);

  // ── UI state ───────────────────────────────────────────────────────────────
  const [collapsed, setCollapsed] = useState<Set<AccountSlug>>(new Set());
  const [isDirty, setIsDirty] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingSavePayload, setPendingSavePayload] = useState<DailyReportSavePayload | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  // ── refs ───────────────────────────────────────────────────────────────────
  const amountRefs  = useRef<Map<string, HTMLInputElement>>(new Map());
  const commentRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const addBtnRefs  = useRef<Map<AccountSlug, HTMLButtonElement>>(new Map());
  const pendingFocus = useRef<{ account: AccountSlug; localId: string } | null>(null);

  // ── toast helpers ──────────────────────────────────────────────────────────
  const toast = useCallback((message: string, type: Toast["type"] = "info") => {
    const id = `${Date.now()}`;
    setToasts(t => [...t, { id, message, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500);
  }, []);

  // ── online / offline ───────────────────────────────────────────────────────
  useEffect(() => {
    const online  = () => setIsOnline(true);
    const offline = () => setIsOnline(false);
    window.addEventListener("online",  online);
    window.addEventListener("offline", offline);
    return () => { window.removeEventListener("online", online); window.removeEventListener("offline", offline); };
  }, []);

  // Auto-retry queued save when coming back online
  useEffect(() => {
    if (isOnline && pendingSavePayload) {
      toast("Сеть восстановлена, сохраняю...", "info");
      doSave(pendingSavePayload);
      setPendingSavePayload(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline]);

  // ── load report ────────────────────────────────────────────────────────────
  const loadReport = useCallback(async (d: string) => {
    setIsLoading(true);
    try {
      const data = await fetchDailyReport(d);
      setOpening(data.opening_balances);
      setNotes(data.notes);
      setIsClosed(data.is_closed);

      const newRows = emptyRows();
      for (const tx of data.transactions) {
        newRows[tx.account].push({
          localId: newId(),
          direction: tx.direction,
          amount:  tx.amount.replace(/\.00$/, ""),
          comment: tx.comment,
        });
      }
      // Always ensure ≥1 empty row per account for easy entry
      for (const acc of ACCOUNTS) {
        if (newRows[acc.slug].length === 0) newRows[acc.slug].push(emptyRow());
      }
      setRows(newRows);
      setIsDirty(false);
    } catch {
      toast("Не удалось загрузить данные за этот день", "error");
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadReport(date); }, [date, loadReport]);

  // beforeunload guard
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (isDirty) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [isDirty]);

  // ── date navigation ────────────────────────────────────────────────────────
  const navigateDate = (delta: number) => {
    if (isDirty && !confirm("Есть несохранённые изменения. Перейти без сохранения?")) return;
    setDate(prev => shiftDate(prev, delta));
  };

  // ── computed balances ──────────────────────────────────────────────────────
  const closing = useMemo<Record<AccountSlug, number>>(() => {
    const result = {} as Record<AccountSlug, number>;
    for (const acc of ACCOUNTS) {
      const open = parseFloat(opening[acc.slug]) || 0;
      const inc  = rows[acc.slug].filter(r => r.direction === "income").reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
      const exp  = rows[acc.slug].filter(r => r.direction === "expense").reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
      result[acc.slug] = open + inc - exp;
    }
    return result;
  }, [rows, opening]);

  const summary = useMemo(() => {
    let income = 0, expenses = 0;
    for (const acc of ACCOUNTS) {
      for (const r of rows[acc.slug]) {
        const amt = parseFloat(r.amount) || 0;
        if (r.direction === "income")  income   += amt;
        if (r.direction === "expense") expenses += amt;
      }
    }
    return { income, expenses, profit: income - expenses };
  }, [rows]);

  // ── row mutations ──────────────────────────────────────────────────────────
  const updateRow = useCallback((acc: AccountSlug, localId: string, patch: Partial<TxRow>) => {
    setRows(prev => ({ ...prev, [acc]: prev[acc].map(r => r.localId === localId ? { ...r, ...patch } : r) }));
    setIsDirty(true);
  }, []);

  const deleteRow = useCallback((acc: AccountSlug, localId: string) => {
    setRows(prev => {
      const next = prev[acc].filter(r => r.localId !== localId);
      return { ...prev, [acc]: next.length ? next : [emptyRow()] };
    });
    setIsDirty(true);
  }, []);

  const addRow = useCallback((acc: AccountSlug, afterIdx?: number) => {
    const nr = emptyRow();
    setRows(prev => {
      const list = [...prev[acc]];
      if (afterIdx != null) list.splice(afterIdx, 0, nr);
      else list.push(nr);
      return { ...prev, [acc]: list };
    });
    pendingFocus.current = { account: acc, localId: nr.localId };
    setIsDirty(true);
  }, []);

  // ── save ───────────────────────────────────────────────────────────────────
  const buildPayload = useCallback((): DailyReportSavePayload => {
    // Collect non-empty rows + add valid comments to history
    const transactions: DailyReportSavePayload["transactions"] = [];
    for (const acc of ACCOUNTS) {
      rows[acc.slug]
        .filter(r => r.amount.trim() !== "" && parseFloat(r.amount) > 0)
        .forEach((r, i) => {
          if (r.comment) addHistory(r.comment);
          transactions.push({
            account:   acc.slug,
            direction: r.direction,
            amount:    r.amount,
            comment:   r.comment,
            row_order: i,
          });
        });
    }
    return { date, transactions, opening_balances: opening, notes };
  }, [date, rows, opening, notes]);

  const doSave = useCallback(async (payload: DailyReportSavePayload) => {
    setIsSaving(true);
    const prevRows = rows;
    try {
      const data = await saveDailyReport(payload);
      // Sync state from server response
      setOpening(data.opening_balances);
      setIsClosed(data.is_closed);
      setIsDirty(false);
      toast("Сохранено ✓", "success");
    } catch {
      // Rollback optimistic state
      setRows(prevRows);
      toast("Ошибка сохранения — попробуйте ещё раз", "error");
    } finally {
      setIsSaving(false);
    }
  }, [rows, toast]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = () => {
    const payload = buildPayload();
    if (!isOnline) {
      setPendingSavePayload(payload);
      toast("Нет соединения. Сохранение в очереди.", "info");
      return;
    }
    doSave(payload);
  };

  // ── validation ─────────────────────────────────────────────────────────────
  const validationErrors = useMemo(() => {
    const errs: string[] = [];
    for (const acc of ACCOUNTS) {
      rows[acc.slug].forEach((r, i) => {
        const hasAmount  = r.amount.trim() !== "" && parseFloat(r.amount) > 0;
        const hasComment = r.comment.trim() !== "";
        if (hasComment && !hasAmount)
          errs.push(`${acc.label} стр.${i + 1}: введён комментарий, но не сумма`);
        if (hasAmount && !hasComment)
          {} // amount without comment is fine
      });
    }
    return errs;
  }, [rows]);

  const openingValues: Record<AccountSlug, number | null> = {
    kaspi_pay: parseFloat(opening.kaspi_pay) || 0,
    halyk:     parseFloat(opening.halyk)     || 0,
    cash:      parseFloat(opening.cash)      || 0,
  };

  const closingValues: Record<AccountSlug, number | null> = closing;

  const disabled = isLoading || isSaving || isClosed;

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: "'Inter','Segoe UI',sans-serif", fontSize: 13, color: C.text, position: "relative" }}>

      {/* ── Toast stack ── */}
      <div style={{ position: "fixed", top: 16, right: 16, zIndex: 9999, display: "flex", flexDirection: "column", gap: 8, pointerEvents: "none" }}>
        {toasts.map(t => (
          <div key={t.id} role="alert" style={{
            padding: "10px 16px", borderRadius: 10, fontSize: 13, fontWeight: 600,
            background: t.type === "success" ? C.greenBg : t.type === "error" ? C.redBg : C.accentBg,
            border: `1px solid ${t.type === "success" ? "#bbf7d0" : t.type === "error" ? "#fecaca" : "#bfdbfe"}`,
            color: t.type === "success" ? C.green : t.type === "error" ? C.red : C.accent,
            boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
            animation: "none",
          }}>{t.message}</div>
        ))}
      </div>

      {/* ── Loading overlay ── */}
      {isLoading && (
        <div style={{
          position: "absolute", inset: 0, background: "rgba(245,245,240,0.7)",
          zIndex: 10, display: "flex", alignItems: "center", justifyContent: "center",
          borderRadius: 12, fontSize: 14, color: C.textSub, fontWeight: 600,
        }}>
          Загрузка данных…
        </div>
      )}

      {/* ── Date navigator ── */}
      <div style={{ ...card, padding: "12px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 12 }}>
        <button
          type="button" aria-label="Предыдущий день"
          onClick={() => navigateDate(-1)}
          style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${C.border2}`, background: C.bg, cursor: "pointer", fontSize: 16 }}
        >←</button>

        <div style={{ flex: 1, textAlign: "center" }}>
          <input
            type="date"
            value={date}
            aria-label="Выбрать дату"
            onChange={e => {
              if (isDirty && !confirm("Есть несохранённые изменения. Перейти без сохранения?")) return;
              setDate(e.target.value);
            }}
            style={{ border: "none", background: "transparent", fontSize: 14, fontWeight: 700, color: C.text, fontFamily: "inherit", cursor: "pointer", outline: "none" }}
          />
          <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>{formatDateLabel(date)}</div>
        </div>

        <button
          type="button" aria-label="Следующий день"
          onClick={() => navigateDate(1)}
          style={{ width: 32, height: 32, borderRadius: 8, border: `1px solid ${C.border2}`, background: C.bg, cursor: "pointer", fontSize: 16 }}
        >→</button>

        {/* Status chips */}
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {!isOnline && (
            <span style={{ background: C.amberBg, border: "1px solid #fde68a", borderRadius: 20, padding: "3px 10px", fontSize: 10, fontWeight: 700, color: C.amber }}>
              Оффлайн
            </span>
          )}
          {pendingSavePayload && (
            <span style={{ background: C.amberBg, border: "1px solid #fde68a", borderRadius: 20, padding: "3px 10px", fontSize: 10, fontWeight: 700, color: C.amber }}>
              В очереди
            </span>
          )}
          {isDirty && !isSaving && (
            <span style={{ background: C.amberBg, border: "1px solid #fde68a", borderRadius: 20, padding: "3px 10px", fontSize: 10, fontWeight: 700, color: C.amber }}>
              Не сохранено
            </span>
          )}
          {isClosed && (
            <span style={{ background: C.redBg, border: "1px solid #fecaca", borderRadius: 20, padding: "3px 10px", fontSize: 10, fontWeight: 700, color: C.red }}>
              Закрыт
            </span>
          )}
        </div>
      </div>

      {/* ── Opening balances ── */}
      <BalancesRow
        label="Остаток начало дня"
        values={openingValues}
        loading={isLoading}
        color={C.textSub}
      />

      {/* ── Account sections ── */}
      <div style={isMobile ? {} : { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
        {ACCOUNTS.map(acc => (
          <AccountSection
            key={acc.slug}
            slug={acc.slug}
            label={acc.label}
            color={acc.color}
            rows={rows[acc.slug]}
            disabled={disabled}
            collapsed={collapsed.has(acc.slug)}
            onToggleCollapse={() =>
              setCollapsed(prev => {
                const next = new Set(prev);
                next.has(acc.slug) ? next.delete(acc.slug) : next.add(acc.slug);
                return next;
              })
            }
            onAddRow={(afterIdx) => addRow(acc.slug, afterIdx)}
            onUpdateRow={(localId, patch) => updateRow(acc.slug, localId, patch)}
            onDeleteRow={(localId) => deleteRow(acc.slug, localId)}
            amountRefs={amountRefs.current}
            commentRefs={commentRefs.current}
            pendingFocus={pendingFocus}
            addBtnRef={el => { if (el) addBtnRefs.current.set(acc.slug, el); else addBtnRefs.current.delete(acc.slug); }}
          />
        ))}
      </div>

      {/* ── Closing balances ── */}
      <BalancesRow
        label="Остаток конец дня"
        values={closingValues}
        loading={isLoading}
        color={C.accent}
      />

      {/* ── Daily summary ── */}
      <div style={{ ...card, padding: "12px 16px", marginBottom: 16, display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.textSub, marginRight: 4 }}>Итог дня:</div>
        {[
          { label: "Доход",   value: summary.income,   color: C.green, bg: C.greenBg, bd: "#bbf7d0" },
          { label: "Расходы", value: summary.expenses,  color: C.red,   bg: C.redBg,   bd: "#fecaca" },
          {
            label: "Прибыль",
            value: summary.profit,
            color: summary.profit >= 0 ? C.green : C.red,
            bg:    summary.profit >= 0 ? C.greenBg : C.redBg,
            bd:    summary.profit >= 0 ? "#bbf7d0" : "#fecaca",
          },
        ].map(k => (
          <div key={k.label} style={{ background: k.bg, border: `1px solid ${k.bd}`, borderRadius: 10, padding: "8px 16px", textAlign: "center" }}>
            <div style={{ fontSize: 10, color: C.textMuted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 }}>{k.label}</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: k.color }}>
              {k.value < 0 ? "−" : ""}{fmtFull(Math.abs(k.value))} тг
            </div>
          </div>
        ))}
        <div style={{ marginLeft: "auto", fontSize: 11, color: C.textMuted }}>
          Итого на счетах: <strong style={{ color: C.accent }}>
            {fmtFull(Object.values(closing).reduce((s, v) => s + v, 0))} тг
          </strong>
        </div>
      </div>

      {/* ── Validation errors ── */}
      {validationErrors.length > 0 && (
        <div style={{ background: C.amberBg, border: "1px solid #fde68a", borderRadius: 10, padding: "10px 14px", marginBottom: 12 }}>
          {validationErrors.map((e, i) => (
            <div key={i} style={{ fontSize: 12, color: C.amber }}>⚠️ {e}</div>
          ))}
        </div>
      )}

      {/* ── Notes ── */}
      <div style={{ marginBottom: 16 }}>
        <textarea
          value={notes}
          disabled={disabled}
          aria-label="Примечания к дню"
          placeholder="Примечания…"
          rows={2}
          onChange={e => { setNotes(e.target.value); setIsDirty(true); }}
          style={{
            width: "100%", background: C.bg, border: `1px solid ${C.border2}`,
            borderRadius: 8, padding: "8px 12px", fontSize: 12, color: C.text,
            fontFamily: "inherit", resize: "vertical", outline: "none",
            boxSizing: "border-box", opacity: disabled ? 0.6 : 1,
          }}
        />
      </div>

      {/* ── Save bar ── */}
      <div style={{
        position: isMobile ? "fixed" : "static",
        bottom: isMobile ? 0 : "auto",
        left: isMobile ? 0 : "auto",
        right: isMobile ? 0 : "auto",
        padding: isMobile ? "12px 16px" : "0",
        background: isMobile ? C.surface : "transparent",
        borderTop: isMobile ? `1px solid ${C.border}` : "none",
        zIndex: isMobile ? 100 : "auto",
        display: "flex", alignItems: "center", gap: 12,
      }}>
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving || isClosed || !isDirty || validationErrors.length > 0}
          aria-label="Сохранить отчёт за день"
          style={{
            flex: isMobile ? 1 : "none",
            background: isDirty && !isClosed ? C.accent : C.bg,
            color: isDirty && !isClosed ? "#fff" : C.textMuted,
            border: `1.5px solid ${isDirty && !isClosed ? C.accent : C.border2}`,
            borderRadius: 8, padding: "10px 28px",
            fontSize: 13, fontWeight: 700, cursor: (isSaving || isClosed || !isDirty) ? "not-allowed" : "pointer",
            fontFamily: "inherit", opacity: (isSaving || !isDirty) ? 0.65 : 1, transition: "all 0.15s",
          }}
        >
          {isSaving ? "Сохранение…" : isClosed ? "День закрыт" : "Сохранить"}
        </button>

        {isClosed && (
          <span style={{ fontSize: 12, color: C.red }}>Отчёт закрыт и защищён от изменений.</span>
        )}
      </div>

      {isMobile && <div style={{ height: 64 }} />}
    </div>
  );
}
