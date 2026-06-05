import { useEffect, useState } from "react";
import { fetchAvailableTabs, fetchPermissions, savePermissions } from "../api/settings";
import type { RolePermission, TabDef } from "../types/settings";
import { useAuth } from "../context/AuthContext";

// ── same design tokens as ClinicScheduler ──────────────────────────────────
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
  shadow: "0 1px 3px rgba(0,0,0,0.07), 0 1px 2px rgba(0,0,0,0.04)",
};
const card = { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, boxShadow: C.shadow };

// Owner role is always locked — displayed but not editable
const OWNER_ROLE = "owner";

export default function SettingsPage({ onBack }: { onBack: () => void }) {
  const { user, logout } = useAuth();

  const [tabs, setTabs] = useState<TabDef[]>([]);
  const [permissions, setPermissions] = useState<RolePermission[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"" | "saved" | "error">("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchAvailableTabs(), fetchPermissions()])
      .then(([t, p]) => {
        setTabs(t);
        setPermissions(p);
      })
      .catch(() => setError("Ошибка загрузки настроек"))
      .finally(() => setLoading(false));
  }, []);

  const toggleTab = (role: string, tabId: string) => {
    if (role === OWNER_ROLE) return; // owner is immutable
    setPermissions(prev =>
      prev.map(p => {
        if (p.role !== role) return p;
        const has = p.tabs.includes(tabId);
        return {
          ...p,
          tabs: has ? p.tabs.filter(t => t !== tabId) : [...p.tabs, tabId],
        };
      })
    );
    setSaveStatus("");
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveStatus("");
    try {
      const updated = await savePermissions(permissions);
      setPermissions(updated);
      setSaveStatus("saved");
    } catch {
      setSaveStatus("error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center", color: C.textSub, fontFamily: "'Inter','Segoe UI',sans-serif" }}>
        Загрузка настроек…
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
          <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.5 }}>⚙️ Настройки доступа</div>
          {user && (
            <div style={{ fontSize: 11, color: C.textMuted, marginTop: 4 }}>
              {user.username}{user.role_label ? ` · ${user.role_label}` : ""}
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button onClick={onBack} style={{ background: C.accentBg, border: `1px solid #bfdbfe`, borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 600, color: C.accent, cursor: "pointer", fontFamily: "inherit" }}>
            ← Назад
          </button>
          <button onClick={logout} style={{ background: "#fff", border: `1px solid ${C.border2}`, borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 600, color: C.textSub, cursor: "pointer", fontFamily: "inherit" }}>
            Выйти
          </button>
        </div>
      </div>

      <div style={{ padding: 24, maxWidth: 860 }}>

        {error && (
          <div style={{ background: C.redBg, border: `1px solid #fecaca`, borderRadius: 10, padding: "12px 16px", marginBottom: 20, color: C.red }}>
            ⚠️ {error}
          </div>
        )}

        {/* ── INFO BANNER ── */}
        <div style={{ background: C.accentBg, border: `1px solid #bfdbfe`, borderRadius: 10, padding: "12px 16px", marginBottom: 24, fontSize: 12, color: C.textSub, lineHeight: 1.6 }}>
          Управляйте тем, какие разделы доступны каждой роли. Роль <strong>Владелец</strong> всегда имеет доступ ко всем вкладкам.
          Изменения вступают в силу при следующем входе пользователя.
        </div>

        {/* ── PERMISSIONS TABLE ── */}
        <div style={{ ...card, overflow: "hidden", marginBottom: 20 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#fafaf9" }}>
                <th style={{ padding: "12px 16px", textAlign: "left", fontWeight: 700, fontSize: 12, color: C.textSub, borderBottom: `1px solid ${C.border}`, width: 180 }}>
                  Роль
                </th>
                {tabs.map(tab => (
                  <th key={tab.id} style={{ padding: "12px 10px", textAlign: "center", fontWeight: 600, fontSize: 11, color: C.textSub, borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap" }}>
                    {tab.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {permissions.map((row, i) => {
                const isOwner = row.role === OWNER_ROLE;
                return (
                  <tr
                    key={row.role}
                    style={{
                      background: isOwner ? "#fafaf9" : i % 2 === 0 ? "#fff" : "#fafaf9",
                      borderBottom: `1px solid ${C.border}`,
                      opacity: isOwner ? 0.75 : 1,
                    }}
                  >
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ fontWeight: 700, color: C.text }}>{row.role_label}</div>
                      <div style={{ fontSize: 10, color: C.textMuted }}>{row.tabs.length} вкладок</div>
                    </td>
                    {tabs.map(tab => {
                      const checked = row.tabs.includes(tab.id);
                      return (
                        <td key={tab.id} style={{ padding: "12px 10px", textAlign: "center" }}>
                          <label style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: isOwner ? "not-allowed" : "pointer" }}>
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={isOwner}
                              onChange={() => toggleTab(row.role, tab.id)}
                              style={{ width: 16, height: 16, accentColor: C.accent, cursor: isOwner ? "not-allowed" : "pointer" }}
                            />
                          </label>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ── SAVE BAR ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              background: C.accent,
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "10px 28px",
              fontSize: 13,
              fontWeight: 700,
              cursor: saving ? "not-allowed" : "pointer",
              fontFamily: "inherit",
              opacity: saving ? 0.7 : 1,
              transition: "opacity 0.15s",
            }}
          >
            {saving ? "Сохранение…" : "Сохранить изменения"}
          </button>

          {saveStatus === "saved" && (
            <span style={{ fontSize: 12, color: C.green, fontWeight: 600 }}>✓ Сохранено</span>
          )}
          {saveStatus === "error" && (
            <span style={{ fontSize: 12, color: C.red }}>⚠️ Ошибка сохранения — нет прав?</span>
          )}
        </div>

        {/* ── LEGEND ── */}
        <div style={{ marginTop: 28, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 16px", fontSize: 11, color: C.textMuted, lineHeight: 1.8 }}>
          <strong style={{ color: C.textSub }}>Вкладки:</strong>
          {tabs.map(t => (
            <span key={t.id} style={{ marginLeft: 12 }}>
              <strong>{t.label}</strong>
            </span>
          ))}
        </div>

      </div>
    </div>
  );
}
