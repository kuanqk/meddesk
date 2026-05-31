// @ts-nocheck — ported from docs/clinic_scheduler_v2.jsx; API integration pending
import { useState, useMemo, useEffect, useRef } from "react";
import { fetchSchedulerState, saveSchedulerState } from "../../api/scheduler";

const HOURS    = Array.from({ length: 14 }, (_, i) => i + 8);
const DAYS     = ["Пн","Вт","Ср","Чт","Пт","Сб","Вс"];
const DAYS_FULL= ["Понедельник","Вторник","Среда","Четверг","Пятница","Суббота","Воскресенье"];
const ROOMS    = [2, 6, 7];
const REVENUE_PER_HOUR = 33000;
const IMPLANT_RATE = 0.15;
const LAB_RATE     = 0.04;

const PALETTE = [
  "#3b82f6","#7c3aed","#059669","#d97706","#db2777",
  "#0891b2","#ea580c","#65a30d","#9333ea","#e11d48",
  "#0284c7","#16a34a","#b45309","#6366f1","#dc2626",
];

const INITIAL_DOCTORS = [
  { id:"dana",     name:"Дана",    color:"#3b82f6", role:"doctor", rate:0.35, threshold2:null,    deductImplant:false, deductLab:false },
  { id:"merey",    name:"Мерей",   color:"#7c3aed", role:"doctor", rate:0.35, threshold2:null,    deductImplant:false, deductLab:false },
  { id:"alisher",  name:"Алишер",  color:"#059669", role:"doctor", rate:0.30, rate2:0.35, threshold2:4000000, deductImplant:true,  deductLab:false },
  { id:"shamil",   name:"Шамиль",  color:"#d97706", role:"doctor", rate:0.30, rate2:0.35, threshold2:4000000, deductImplant:true,  deductLab:false },
  { id:"madina",   name:"Мадина",  color:"#db2777", role:"doctor", rate:0.30, threshold2:null,    deductImplant:false, deductLab:true  },
  { id:"erbol",    name:"Ербол",   color:"#0891b2", role:"doctor", rate:0.30, rate2:0.35, threshold2:4000000, deductImplant:true,  deductLab:false },
  { id:"zhanneta", name:"Жаннета", color:"#ea580c", role:"doctor", rate:0.30, rate2:0.35, threshold2:5000000, deductImplant:true,  deductLab:false },
  { id:"diar",     name:"Диар",    color:"#65a30d", role:"doctor", rate:0.40, threshold2:null,    deductImplant:false, deductLab:false },
];

function calcDoctorSalary(revenue, doctor) {
  let base = revenue;
  if (doctor.deductImplant) base = revenue * (1 - IMPLANT_RATE);
  if (doctor.deductLab)     base = revenue * (1 - LAB_RATE);
  if (!doctor.threshold2 || base <= doctor.threshold2) return base * doctor.rate;
  return doctor.threshold2 * doctor.rate + (base - doctor.threshold2) * doctor.rate2;
}

function cloneSched(prev) {
  const s = JSON.parse(JSON.stringify(prev, (k, v) => v instanceof Set ? [...v] : v));
  Object.keys(s).forEach(did =>
    Object.keys(s[did]).forEach(di => { s[did][di].hours = new Set(s[did][di].hours); })
  );
  return s;
}

// Blocked hours for a person on a day in a room.
// Rule: doctors can't share room+hour with other doctors.
//       anesthesiologists can't share room+hour with other anesthesiologists.
//       doctors and anesthesiologists CAN overlap.
function getBlockedHours(schedule, personId, dayIdx, room, allPeople) {
  if (room === null) return new Set();
  const me = allPeople.find(p => p.id === personId);
  const blocked = new Set();
  allPeople.forEach(other => {
    if (other.id === personId) return;
    if (other.role !== me.role) return; // different roles don't block each other
    const c = schedule[other.id]?.[dayIdx];
    if (c && c.room === room) c.hours.forEach(h => blocked.add(h));
  });
  return blocked;
}

function initSchedule(people) {
  const s = {};
  people.forEach(p => {
    s[p.id] = {};
    DAYS.forEach((_, di) => { s[p.id][di] = { room: null, hours: new Set() }; });
  });
  s["dana"][0].room = 2; s["dana"][1].room = 2;
  s["dana"][2].room = 2; s["dana"][3].room = 2;
  [0,1,2,3].forEach(di => { for (let h=9;h<18;h++) s["dana"][di].hours.add(h); });
  return s;
}

function scheduleToJson(schedule) {
  const out = {};
  Object.keys(schedule).forEach((pid) => {
    out[pid] = {};
    Object.keys(schedule[pid]).forEach((di) => {
      const cell = schedule[pid][di];
      out[pid][di] = { room: cell.room, hours: [...cell.hours] };
    });
  });
  return out;
}

function scheduleFromJson(json, peopleList) {
  const s = {};
  peopleList.forEach((p) => {
    s[p.id] = {};
    DAYS.forEach((_, di) => {
      const day = json?.[p.id]?.[di] ?? json?.[p.id]?.[String(di)];
      s[p.id][di] = {
        room: day?.room ?? null,
        hours: new Set(day?.hours ?? []),
      };
    });
  });
  return s;
}

/* ─── Add/Edit Person Modal ─────────────────────────────────── */
function PersonModal({ person, allPeople, onSave, onClose, C }) {
  const isNew = !person?.id;
  const usedColors = allPeople.map(p => p.color);
  const freeColor = PALETTE.find(c => !usedColors.includes(c)) || PALETTE[0];

  const [form, setForm] = useState(isNew ? {
    name:"", role: person?.role || "doctor", color: freeColor,
    rate: 0.30, rate2: "", threshold2: "",
    deductImplant: false, deductLab: false,
  } : {
    name: person.name, role: person.role, color: person.color,
    rate: person.rate, rate2: person.rate2 || "",
    threshold2: person.threshold2 || "",
    deductImplant: person.deductImplant, deductLab: person.deductLab,
  });

  const upd = (k, v) => setForm(f => ({...f, [k]: v}));

  const handleSave = () => {
    if (!form.name.trim()) return;
    const obj = {
      id: isNew ? `person_${Date.now()}` : person.id,
      name: form.name.trim(),
      role: form.role,
      color: form.color,
      rate: parseFloat(form.rate) || 0.30,
      rate2: form.rate2 !== "" ? parseFloat(form.rate2) : undefined,
      threshold2: form.threshold2 !== "" ? parseFloat(form.threshold2) : null,
      deductImplant: form.deductImplant,
      deductLab: form.deductLab,
    };
    onSave(obj);
  };

  const overlay = { position:"fixed", inset:0, background:"rgba(0,0,0,0.35)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center" };
  const modal   = { background:"#fff", borderRadius:16, padding:28, width:440, boxShadow:"0 20px 60px rgba(0,0,0,0.2)", fontFamily:"inherit" };
  const label   = { fontSize:11, fontWeight:600, color:C.textSub, textTransform:"uppercase", letterSpacing:0.8, marginBottom:5, display:"block" };
  const input   = { width:"100%", background:C.bg, border:`1px solid ${C.border2}`, borderRadius:7, padding:"9px 11px", color:C.text, fontSize:13, fontFamily:"inherit", outline:"none", boxSizing:"border-box" };
  const row     = { marginBottom:16 };

  return (
    <div style={overlay} onClick={e => e.target===e.currentTarget && onClose()}>
      <div style={modal}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:22 }}>
          <div style={{ fontSize:16, fontWeight:700, color:C.text }}>{isNew ? "Добавить сотрудника" : "Редактировать"}</div>
          <button onClick={onClose} style={{ background:"none", border:"none", fontSize:20, cursor:"pointer", color:C.textMuted, lineHeight:1 }}>×</button>
        </div>

        {/* Name */}
        <div style={row}>
          <label style={label}>Имя</label>
          <input style={input} value={form.name} onChange={e=>upd("name",e.target.value)} placeholder="ФИО или имя" />
        </div>

        {/* Role */}
        <div style={row}>
          <label style={label}>Роль</label>
          <div style={{ display:"flex", gap:8 }}>
            {[{v:"doctor",l:"👨‍⚕️ Врач"},{v:"anesthesiologist",l:"💉 Анестезиолог"}].map(opt => (
              <button key={opt.v} onClick={()=>upd("role",opt.v)} style={{
                flex:1, padding:"8px 0", borderRadius:8, cursor:"pointer", fontSize:12, fontWeight:600,
                background: form.role===opt.v ? C.accent : C.bg,
                color: form.role===opt.v ? "#fff" : C.textSub,
                border: `1.5px solid ${form.role===opt.v ? C.accent : C.border2}`,
              }}>{opt.l}</button>
            ))}
          </div>
        </div>

        {/* Color */}
        <div style={row}>
          <label style={label}>Цвет</label>
          <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
            {PALETTE.map(c => (
              <div key={c} onClick={()=>upd("color",c)} style={{
                width:24, height:24, borderRadius:6, background:c, cursor:"pointer",
                border: form.color===c ? "3px solid #1a1814" : "2px solid transparent",
                boxShadow: form.color===c ? "0 0 0 1px #fff inset" : "none",
              }}/>
            ))}
          </div>
        </div>

        {/* Rate */}
        <div style={{ display:"flex", gap:12, marginBottom:16 }}>
          <div style={{ flex:1 }}>
            <label style={label}>Ставка % (базовая)</label>
            <input style={input} type="number" min="0" max="100" step="1"
              value={Math.round((parseFloat(form.rate)||0)*100)}
              onChange={e=>upd("rate",(parseFloat(e.target.value)||0)/100)}
              placeholder="30" />
          </div>
          <div style={{ flex:1 }}>
            <label style={label}>Ставка % сверх порога</label>
            <input style={input} type="number" min="0" max="100" step="1"
              value={form.rate2 !== "" ? Math.round((parseFloat(form.rate2)||0)*100) : ""}
              onChange={e=>upd("rate2", e.target.value==="" ? "" : (parseFloat(e.target.value)||0)/100)}
              placeholder="35 (необяз.)" />
          </div>
        </div>

        {/* Threshold */}
        <div style={row}>
          <label style={label}>Порог выручки для повышенной ставки (тг)</label>
          <input style={input} type="number"
            value={form.threshold2}
            onChange={e=>upd("threshold2", e.target.value)}
            placeholder="4000000 (необязательно)" />
        </div>

        {/* Deductions */}
        <div style={{ display:"flex", gap:12, marginBottom:22 }}>
          {[{k:"deductImplant",l:"−Стоимость имплантов/коронок"},{k:"deductLab",l:"−Стоимость лабы"}].map(opt => (
            <label key={opt.k} style={{ display:"flex", alignItems:"center", gap:6, fontSize:12, color:C.textSub, cursor:"pointer" }}>
              <input type="checkbox" checked={form[opt.k]} onChange={e=>upd(opt.k,e.target.checked)}
                style={{ width:14, height:14, cursor:"pointer" }} />
              {opt.l}
            </label>
          ))}
        </div>

        {/* Buttons */}
        <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
          <button onClick={onClose} style={{ background:"none", border:`1px solid ${C.border2}`, borderRadius:8, padding:"8px 18px", cursor:"pointer", fontSize:13, color:C.textSub, fontFamily:"inherit" }}>Отмена</button>
          <button onClick={handleSave} style={{ background:form.color, border:"none", borderRadius:8, padding:"8px 20px", cursor:"pointer", fontSize:13, fontWeight:700, color:"#fff", fontFamily:"inherit" }}>
            {isNew ? "Добавить" : "Сохранить"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── MAIN COMPONENT ─────────────────────────────────────────── */
export default function ClinicScheduler() {
  const [activeTab,    setActiveTab]    = useState("schedule");
  const [expenses,     setExpenses]     = useState({ rent:1000000, marketing:1600000, materials:1400000, other:800000, anesthesia_pct:13 });
  const [weekFilter,   setWeekFilter]   = useState("all");
  const [editSlot,     setEditSlot]     = useState(null);
  const [editPersonId, setEditPersonId] = useState(null);
  const [editShift,    setEditShift]    = useState("morning");

  // Dynamic people list
  const [people, setPeople] = useState(INITIAL_DOCTORS);
  const [selId,  setSelId]  = useState(INITIAL_DOCTORS[0].id);
  const [modal,  setModal]  = useState(null); // null | { mode:"add"|"edit", person? }

  // Schedule keyed by person id
  const [schedule, setSchedule] = useState(() => initSchedule(INITIAL_DOCTORS));
  const [isLoading, setIsLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState("");
  const skipSave = useRef(true);
  const saveTimer = useRef(null);

  useEffect(() => {
    fetchSchedulerState()
      .then((data) => {
        if (data?.people?.length) {
          setPeople(data.people);
          setSchedule(scheduleFromJson(data.schedule || {}, data.people));
          if (data.expenses) setExpenses(data.expenses);
          const nextSel = data.sel_id && data.people.find((p) => p.id === data.sel_id)
            ? data.sel_id
            : data.people[0]?.id || null;
          setSelId(nextSel);
        }
      })
      .catch(() => setSaveStatus("error"))
      .finally(() => {
        setIsLoading(false);
        skipSave.current = false;
      });
  }, []);

  useEffect(() => {
    if (skipSave.current || isLoading) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveStatus("saving");
    saveTimer.current = setTimeout(() => {
      saveSchedulerState({
        people,
        schedule: scheduleToJson(schedule),
        expenses,
        sel_id: selId,
      })
        .then(() => setSaveStatus("saved"))
        .catch(() => setSaveStatus("error"));
    }, 800);
    return () => clearTimeout(saveTimer.current);
  }, [people, schedule, expenses, selId, isLoading]);

  /* ── Person CRUD ── */
  const handleSavePerson = (obj) => {
    setPeople(prev => {
      const exists = prev.find(p => p.id === obj.id);
      return exists ? prev.map(p => p.id===obj.id ? obj : p) : [...prev, obj];
    });
    setSchedule(prev => {
      if (prev[obj.id]) return prev;
      const s = cloneSched(prev);
      s[obj.id] = {};
      DAYS.forEach((_, di) => { s[obj.id][di] = { room: null, hours: new Set() }; });
      return s;
    });
    setSelId(obj.id);
    setModal(null);
  };

  const handleDeletePerson = (id) => {
    setPeople(prev => prev.filter(p => p.id !== id));
    setSchedule(prev => { const s = cloneSched(prev); delete s[id]; return s; });
    setSelId(p => p === id ? (people.find(p2=>p2.id!==id)?.id || null) : p);
    setModal(null);
  };

  /* ── Schedule mutations ── */
  const setRoom = (pid, di, ri) => setSchedule(prev => {
    const s = cloneSched(prev);
    s[pid][di].room = s[pid][di].room === ri ? null : ri;
    if (s[pid][di].room !== null) {
      const blocked = getBlockedHours(s, pid, di, s[pid][di].room, people);
      blocked.forEach(h => s[pid][di].hours.delete(h));
    }
    return s;
  });

  const toggleHour = (pid, di, h) => setSchedule(prev => {
    const s = cloneSched(prev);
    const c = s[pid][di];
    const blocked = getBlockedHours(s, pid, di, c.room, people);
    if (blocked.has(h)) return prev;
    c.hours.has(h) ? c.hours.delete(h) : c.hours.add(h);
    return s;
  });

  const clearDay = (pid, di) => setSchedule(prev => {
    const s = cloneSched(prev);
    s[pid][di] = { room: null, hours: new Set() };
    return s;
  });

  const fillShift = (pid, di, shift) => setSchedule(prev => {
    const s = cloneSched(prev);
    const [st,en] = shift==="morning"?[9,15]:[15,21];
    const blocked = getBlockedHours(s, pid, di, s[pid][di].room, people);
    s[pid][di].hours = new Set();
    for(let h=st;h<en;h++) if(!blocked.has(h)) s[pid][di].hours.add(h);
    return s;
  });

  const fillAllDay = (pid, di) => setSchedule(prev => {
    const s = cloneSched(prev);
    const blocked = getBlockedHours(s, pid, di, s[pid][di].room, people);
    s[pid][di].hours = new Set();
    for(let h=8;h<21;h++) if(!blocked.has(h)) s[pid][di].hours.add(h);
    return s;
  });

  /* ── Stats ── */
  const stats = useMemo(() => {
    const personStats = {};
    people.forEach(p => {
      let totalHours = 0;
      DAYS.forEach((_,di) => { const c=schedule[p.id]?.[di]; if(c?.hours.size) totalHours+=c.hours.size; });
      const monthHours = totalHours * 4.3;
      const revenue    = p.role==="doctor" ? monthHours * REVENUE_PER_HOUR : 0;
      const salary     = p.role==="doctor" ? calcDoctorSalary(revenue, p) : monthHours * REVENUE_PER_HOUR * p.rate;
      personStats[p.id] = { totalHours, monthHours, revenue, salary };
    });

    const doctors = people.filter(p=>p.role==="doctor");
    const totalRevenue = doctors.reduce((s,p)=>s+personStats[p.id].revenue, 0);
    const totalSalary  = people.reduce((s,p)=>s+personStats[p.id].salary, 0);
    const anesthesia   = totalRevenue * (expenses.anesthesia_pct/100);
    const tax          = totalRevenue * 0.03;
    const bankFee      = totalRevenue * 0.02;
    const totalExp     = totalSalary + anesthesia + expenses.rent + expenses.marketing + expenses.materials + expenses.other + tax + bankFee;
    const profit       = totalRevenue - totalExp;
    const margin       = totalRevenue > 0 ? profit/totalRevenue*100 : 0;

    // Conflicts: same role + same room + same hour
    const conflicts = {};
    DAYS.forEach((_,di) => {
      ["doctor","anesthesiologist"].forEach(role => {
        const rolePeople = people.filter(p=>p.role===role);
        const rh = {0:{},1:{},2:{}};
        rolePeople.forEach(p => {
          const c = schedule[p.id]?.[di];
          if(!c||c.room===null) return;
          c.hours.forEach(h => { if(!rh[c.room][h]) rh[c.room][h]=[]; rh[c.room][h].push(p.name); });
        });
        Object.entries(rh).forEach(([r,hrs]) =>
          Object.entries(hrs).forEach(([h,names]) => { if(names.length>1) conflicts[`${di}-${r}-${h}-${role}`]=names; })
        );
      });
    });

    return { personStats, totalRevenue, totalSalary, anesthesia, tax, bankFee, totalExp, profit, margin, conflicts };
  }, [schedule, expenses, people]);

  const fmt = n => n>=1000000?`${(n/1000000).toFixed(1)}M`:n>=1000?`${(n/1000).toFixed(0)}k`:String(Math.round(n));
  const fmtFull = n => new Intl.NumberFormat("ru-KZ").format(Math.round(n));
  const conflictCount = Object.keys(stats.conflicts).length;

  const selPerson = people.find(p=>p.id===selId);
  const selStats  = selPerson ? stats.personStats[selPerson.id] : null;

  // ── Design tokens ──
  const C = {
    bg:"#f5f5f0", surface:"#ffffff", border:"#e5e3dd", border2:"#d1cec6",
    text:"#1a1814", textSub:"#6b6760", textMuted:"#9e9b93",
    accent:"#2563eb", accentBg:"#eff6ff",
    green:"#16a34a", greenBg:"#f0fdf4",
    red:"#dc2626", redBg:"#fef2f2",
    amber:"#b45309", amberBg:"#fffbeb",
    teal:"#0891b2", tealBg:"#ecfeff",
    shadow:"0 1px 3px rgba(0,0,0,0.07), 0 1px 2px rgba(0,0,0,0.04)",
  };
  const card = { background:C.surface, border:`1px solid ${C.border}`, borderRadius:12, boxShadow:C.shadow };
  const roomColors  = ["#1d4ed8","#15803d","#92400e"];
  const roomBgs     = ["#dbeafe","#dcfce7","#fef9c3"];
  const roomBorders = ["#bfdbfe","#bbf7d0","#fde68a"];

  const doctors       = people.filter(p=>p.role==="doctor");
  const anesthesists  = people.filter(p=>p.role==="anesthesiologist");

  // ── Render ──
  if (isLoading) {
    return (
      <div style={{ minHeight:"100vh", background:C.bg, display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'Inter','Segoe UI',sans-serif", color:C.textSub }}>
        Загрузка...
      </div>
    );
  }

  return (
    <div style={{ minHeight:"100vh", background:C.bg, color:C.text, fontFamily:"'Inter','Segoe UI',sans-serif", fontSize:13 }}>
      {modal && (
        <PersonModal
          person={modal.person||null}
          allPeople={people}
          onSave={handleSavePerson}
          onClose={()=>setModal(null)}
          C={C}
        />
      )}

      {/* ── HEADER ── */}
      <div style={{ background:C.surface, borderBottom:`1px solid ${C.border}`, padding:"16px 24px 0", boxShadow:"0 1px 0 #e5e3dd" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
          <div>
            <div style={{ fontSize:11, color:C.accent, letterSpacing:2, textTransform:"uppercase", fontWeight:600, marginBottom:4 }}>Стоматологическая клиника</div>
            <div style={{ fontSize:20, fontWeight:700, letterSpacing:-0.5 }}>Планировщик расписания · Июнь 2026</div>
          </div>
          <div style={{ display:"flex", gap:10, alignItems:"center" }}>
            {saveStatus === "saving" && <span style={{ fontSize:11, color:C.textMuted }}>Сохранение...</span>}
            {saveStatus === "saved" && <span style={{ fontSize:11, color:C.green }}>Сохранено</span>}
            {saveStatus === "error" && <span style={{ fontSize:11, color:C.red }}>Ошибка сохранения</span>}
            {[
              { label:"Выручка",   value:fmt(stats.totalRevenue), bg:C.greenBg,  bd:"#bbf7d0", cl:C.green },
              { label:"Прибыль",   value:fmt(stats.profit), bg:stats.profit>0?C.greenBg:C.redBg, bd:stats.profit>0?"#bbf7d0":"#fecaca", cl:stats.profit>0?C.green:C.red },
              { label:"Маржа",     value:`${stats.margin.toFixed(1)}%`, bg:stats.margin>20?C.greenBg:C.amberBg, bd:stats.margin>20?"#bbf7d0":"#fde68a", cl:stats.margin>20?C.green:C.amber },
              { label:"Конфликты", value:conflictCount, bg:conflictCount>0?C.redBg:C.greenBg, bd:conflictCount>0?"#fecaca":"#bbf7d0", cl:conflictCount>0?C.red:C.green },
            ].map(k=>(
              <div key={k.label} style={{ background:k.bg, border:`1px solid ${k.bd}`, borderRadius:10, padding:"10px 16px", textAlign:"center", minWidth:86, boxShadow:C.shadow }}>
                <div style={{ fontSize:10, color:C.textMuted, textTransform:"uppercase", letterSpacing:1, marginBottom:3, fontWeight:500 }}>{k.label}</div>
                <div style={{ fontSize:17, fontWeight:700, color:k.cl }}>{k.value}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display:"flex", gap:2 }}>
          {[{id:"schedule",label:"📅 Расписание"},{id:"pl",label:"💰 P&L"},{id:"week",label:"📆 По дням"},{id:"rooms",label:"🏥 Кабинеты"}].map(t=>(
            <button key={t.id} onClick={()=>setActiveTab(t.id)} style={{
              background:"transparent", border:"none",
              borderBottom: activeTab===t.id?`2px solid ${C.accent}`:"2px solid transparent",
              color: activeTab===t.id?C.accent:C.textSub,
              padding:"9px 18px", cursor:"pointer", fontSize:13, fontFamily:"inherit",
              fontWeight:activeTab===t.id?600:400, transition:"all 0.15s",
            }}>{t.label}</button>
          ))}
        </div>
      </div>

      <div style={{ padding:24 }}>

        {/* ══ SCHEDULE TAB ══ */}
        {activeTab==="schedule" && (
          <div style={{ display:"flex", gap:20 }}>

            {/* Sidebar */}
            <div style={{ width:200, flexShrink:0 }}>

              {/* Doctors group */}
              <div style={{ marginBottom:16 }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
                  <div style={{ fontSize:10, color:C.textMuted, letterSpacing:2, textTransform:"uppercase", fontWeight:600 }}>👨‍⚕️ Врачи ({doctors.length})</div>
                  <button onClick={()=>setModal({mode:"add",person:{role:"doctor"}})} style={{ background:C.accentBg, border:`1px solid #bfdbfe`, color:C.accent, borderRadius:6, padding:"2px 8px", fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>+ Добавить</button>
                </div>
                {doctors.map(p => {
                  const ps = stats.personStats[p.id];
                  const active = selId===p.id;
                  return (
                    <div key={p.id} style={{ display:"flex", alignItems:"center", gap:4, marginBottom:4 }}>
                      <div onClick={()=>setSelId(p.id)} style={{
                        flex:1, background:active?C.accentBg:C.surface,
                        border:active?"1px solid #bfdbfe":`1px solid ${C.border}`,
                        borderLeft:`3px solid ${p.color}`, borderRadius:8, padding:"7px 10px",
                        cursor:"pointer", transition:"all 0.15s", boxShadow:active?"0 0 0 3px #dbeafe":C.shadow,
                      }}>
                        <div style={{ fontWeight:600, color:active?C.accent:C.text, fontSize:12 }}>{p.name}</div>
                        <div style={{ fontSize:10, color:C.textMuted, marginTop:1 }}>{Math.round(ps.monthHours)}ч · <span style={{ color:C.green }}>{fmt(ps.revenue)}</span></div>
                      </div>
                      <button onClick={()=>setModal({mode:"edit",person:p})} style={{ background:"none", border:`1px solid ${C.border}`, color:C.textMuted, borderRadius:6, width:24, height:24, cursor:"pointer", fontSize:11 }}>✎</button>
                    </div>
                  );
                })}
              </div>

              {/* Anesthesiologists group */}
              <div>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
                  <div style={{ fontSize:10, color:C.textMuted, letterSpacing:2, textTransform:"uppercase", fontWeight:600 }}>💉 Анест. ({anesthesists.length})</div>
                  <button onClick={()=>setModal({mode:"add",person:{role:"anesthesiologist"}})} style={{ background:C.tealBg, border:`1px solid #a5f3fc`, color:C.teal, borderRadius:6, padding:"2px 8px", fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>+ Добавить</button>
                </div>
                {anesthesists.length === 0 && (
                  <div style={{ fontSize:11, color:C.textMuted, padding:"8px 10px", background:C.tealBg, borderRadius:8, border:`1px solid #a5f3fc`, textAlign:"center" }}>
                    Нет анестезиологов.<br/>Нажмите + Добавить
                  </div>
                )}
                {anesthesists.map(p => {
                  const ps = stats.personStats[p.id];
                  const active = selId===p.id;
                  return (
                    <div key={p.id} style={{ display:"flex", alignItems:"center", gap:4, marginBottom:4 }}>
                      <div onClick={()=>setSelId(p.id)} style={{
                        flex:1, background:active?C.tealBg:C.surface,
                        border:active?"1px solid #a5f3fc":`1px solid ${C.border}`,
                        borderLeft:`3px solid ${p.color}`, borderRadius:8, padding:"7px 10px",
                        cursor:"pointer", transition:"all 0.15s",
                      }}>
                        <div style={{ fontWeight:600, color:active?C.teal:C.text, fontSize:12 }}>{p.name}</div>
                        <div style={{ fontSize:10, color:C.textMuted, marginTop:1 }}>{Math.round(ps.monthHours)}ч · <span style={{ color:C.teal }}>{(p.rate*100).toFixed(0)}% ставка</span></div>
                      </div>
                      <button onClick={()=>setModal({mode:"edit",person:p})} style={{ background:"none", border:`1px solid ${C.border}`, color:C.textMuted, borderRadius:6, width:24, height:24, cursor:"pointer", fontSize:11 }}>✎</button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Schedule grid */}
            <div style={{ flex:1, ...card, padding:20 }}>
              {selPerson && selStats ? (
                <>
                  {/* Person header */}
                  <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16, paddingBottom:14, borderBottom:`1px solid ${C.border}` }}>
                    <div style={{ width:10, height:10, borderRadius:"50%", background:selPerson.color }} />
                    <span style={{ fontSize:15, fontWeight:700 }}>{selPerson.name}</span>
                    <span style={{ background:selPerson.role==="doctor"?C.accentBg:C.tealBg, color:selPerson.role==="doctor"?C.accent:C.teal, border:`1px solid ${selPerson.role==="doctor"?"#bfdbfe":"#a5f3fc"}`, borderRadius:20, padding:"2px 8px", fontSize:10, fontWeight:600 }}>
                      {selPerson.role==="doctor"?"👨‍⚕️ Врач":"💉 Анестезиолог"}
                    </span>
                    <span style={{ color:C.textMuted, fontSize:11 }}>
                      {selPerson.rate2
                        ? `${(selPerson.rate*100).toFixed(0)}% до ${fmt(selPerson.threshold2)} · ${(selPerson.rate2*100).toFixed(0)}% сверх`
                        : `${(selPerson.rate*100).toFixed(0)}% от выручки`}
                      {selPerson.deductImplant&&" · −импланты"}{selPerson.deductLab&&" · −лаба"}
                    </span>
                    <div style={{ marginLeft:"auto", display:"flex", gap:12, alignItems:"center" }}>
                      {selPerson.role==="doctor" && <span style={{ fontSize:12 }}>Выручка: <strong style={{ color:C.green }}>{fmtFull(selStats.revenue)} тг</strong></span>}
                      <span style={{ fontSize:12 }}>ФОТ: <strong style={{ color:C.amber }}>{fmtFull(selStats.salary)} тг</strong></span>
                      <button onClick={()=>setModal({mode:"edit",person:selPerson})} style={{ background:C.bg, border:`1px solid ${C.border2}`, borderRadius:7, padding:"4px 10px", fontSize:11, cursor:"pointer", color:C.textSub, fontFamily:"inherit" }}>✎ Изменить</button>
                      <button onClick={()=>{ if(window.confirm(`Удалить ${selPerson.name}?`)) handleDeletePerson(selPerson.id); }} style={{ background:C.redBg, border:"1px solid #fecaca", borderRadius:7, padding:"4px 10px", fontSize:11, cursor:"pointer", color:C.red, fontFamily:"inherit" }}>✕ Удалить</button>
                    </div>
                  </div>

                  {selPerson.role==="anesthesiologist" && (
                    <div style={{ background:C.tealBg, border:"1px solid #a5f3fc", borderRadius:8, padding:"8px 12px", marginBottom:14, fontSize:11, color:C.teal }}>
                      💡 Анестезиолог может работать в том же кабинете и время что и врач — конфликт считается только между анестезиологами.
                    </div>
                  )}

                  {/* Hour labels */}
                  <div style={{ display:"flex", gap:2, marginBottom:4, paddingLeft:36 }}>
                    {HOURS.map(h=><div key={h} style={{ flex:1, textAlign:"center", fontSize:9, color:C.textMuted, minWidth:0 }}>{h}</div>)}
                  </div>

                  {DAYS.map((day, di) => {
                    const cell    = schedule[selPerson.id]?.[di] || { hours:new Set(), room:null };
                    const blocked = getBlockedHours(schedule, selPerson.id, di, cell.room, people);
                    const hasConflict = HOURS.some(h => cell.hours.has(h) && cell.room!==null && stats.conflicts[`${di}-${cell.room}-${h}-${selPerson.role}`]);
                    return (
                      <div key={di} style={{
                        marginBottom:6,
                        background:hasConflict?"#fff5f5":di>=5?"#fffbf0":"transparent",
                        border:hasConflict?"1px solid #fecaca":di>=5?"1px solid #fde68a":"1px solid transparent",
                        borderRadius:8, padding:"4px 6px",
                      }}>
                        <div style={{ display:"flex", alignItems:"center", gap:2 }}>
                          <div style={{ width:30, fontSize:12, fontWeight:600, color:di>=5?C.amber:C.textSub, flexShrink:0 }}>{day}</div>
                          {HOURS.map(h=>{
                            const sel2   = cell.hours.has(h);
                            const isBlk  = blocked.has(h);
                            const conf   = stats.conflicts[`${di}-${cell.room}-${h}-${selPerson.role}`];
                            return (
                              <div key={h} onClick={()=>!isBlk&&toggleHour(selPerson.id,di,h)}
                                title={isBlk?"Занято другим сотрудником той же роли":`${h}:00–${h+1}:00`}
                                style={{
                                  flex:1, height:24, minWidth:0,
                                  background:conf?"#fca5a5":isBlk?"#eeebe6":sel2?selPerson.color+"30":"#f3f2ef",
                                  border:`1px solid ${conf?"#ef4444":isBlk?"#dedad3":sel2?selPerson.color:C.border}`,
                                  borderRadius:3, cursor:isBlk?"not-allowed":"pointer", transition:"all 0.1s",
                                  opacity:isBlk?0.6:1, position:"relative",
                                }}>
                                {isBlk&&<div style={{ position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:7,color:"#b8b2aa",pointerEvents:"none" }}>×</div>}
                              </div>
                            );
                          })}
                        </div>
                        <div style={{ display:"flex", alignItems:"center", gap:4, marginTop:4, paddingLeft:32 }}>
                          <div style={{ display:"flex", gap:3 }}>
                            {ROOMS.map((rn,ri)=>(
                              <div key={ri} onClick={()=>setRoom(selPerson.id,di,ri)} title={`Кабинет ${rn}`} style={{
                                width:26, height:20, borderRadius:4,
                                background:cell.room===ri?selPerson.color:"#f0eeea",
                                border:`1.5px solid ${cell.room===ri?selPerson.color:C.border2}`,
                                cursor:"pointer", fontSize:10, fontWeight:700,
                                display:"flex", alignItems:"center", justifyContent:"center",
                                color:cell.room===ri?"#fff":C.textMuted, transition:"all 0.12s",
                              }}>{rn}</div>
                            ))}
                          </div>
                          <div style={{ width:1, height:16, background:C.border, margin:"0 2px" }} />
                          {[
                            {l:"Утро",  fn:()=>fillShift(selPerson.id,di,"morning")},
                            {l:"Вечер", fn:()=>fillShift(selPerson.id,di,"evening")},
                            {l:"День",  fn:()=>fillAllDay(selPerson.id,di)},
                            {l:"✕",     fn:()=>clearDay(selPerson.id,di)},
                          ].map(b=>(
                            <button key={b.l} onClick={b.fn} style={{
                              background:C.surface, border:`1px solid ${C.border2}`,
                              color:b.l==="День"?C.accent:b.l==="✕"?C.red:C.textSub,
                              borderRadius:4, padding:"0 7px", height:20,
                              cursor:"pointer", fontSize:10, fontFamily:"inherit", fontWeight:600, whiteSpace:"nowrap",
                            }}>{b.l}</button>
                          ))}
                          <div style={{ marginLeft:"auto", fontSize:11, color:C.textMuted, fontWeight:600 }}>
                            {cell.hours.size>0?`${cell.hours.size}ч${cell.room!==null?" · Каб."+ROOMS[cell.room]:""}` : ""}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  <div style={{ marginTop:14, padding:"10px 14px", background:C.accentBg, borderRadius:8, border:"1px solid #bfdbfe", display:"flex", gap:18, fontSize:11, color:C.textSub, flexWrap:"wrap" }}>
                    <span>Клик на час — вкл/выкл</span>
                    <span><strong>2 6 7</strong> — кабинет</span>
                    <span>Утро 9–15 · Вечер 15–21 · День 8–21</span>
                    <span style={{ color:"#9ca3af" }}>× — занято тем же типом сотрудника</span>
                    <span style={{ color:C.teal }}>💉 Анестезиологи не блокируют врачей</span>
                  </div>
                </>
              ) : (
                <div style={{ textAlign:"center", padding:"40px 0", color:C.textMuted }}>Выберите сотрудника из списка</div>
              )}
            </div>
          </div>
        )}

        {/* ══ P&L TAB ══ */}
        {activeTab==="pl" && (
          <div style={{ display:"flex", gap:20 }}>
            <div style={{ flex:1 }}>
              {/* Doctors table */}
              {[{group:"doctor",title:"👨‍⚕️ Врачи",cols:["Врач","Часов/мес","Выручка","Вычеты","База","Ставка","ФОТ","% вyr"]},
                {group:"anesthesiologist",title:"💉 Анестезиологи",cols:["Имя","Часов/мес","—","—","—","Ставка","ФОТ","—"]}
              ].map(grp => {
                const grpPeople = people.filter(p=>p.role===grp.group);
                if (grpPeople.length===0) return null;
                return (
                  <div key={grp.group} style={{ ...card, overflow:"hidden", marginBottom:20 }}>
                    <div style={{ padding:"12px 18px", borderBottom:`1px solid ${C.border}`, fontWeight:700, fontSize:13 }}>{grp.title}</div>
                    <table style={{ width:"100%", borderCollapse:"collapse" }}>
                      <thead>
                        <tr style={{ background:"#fafaf9" }}>
                          {grp.cols.map(h=>(
                            <th key={h} style={{ padding:"7px 12px", textAlign:"right", fontSize:10, color:C.textMuted, fontWeight:600, textTransform:"uppercase", letterSpacing:0.8, borderBottom:`1px solid ${C.border}` }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {grpPeople.map((p,i) => {
                          const ps = stats.personStats[p.id];
                          let deduction = 0;
                          if(p.deductImplant) deduction = ps.revenue*IMPLANT_RATE;
                          if(p.deductLab)     deduction = ps.revenue*LAB_RATE;
                          const base = ps.revenue - deduction;
                          const rateLabel = p.rate2?`${(p.rate*100).toFixed(0)}/${(p.rate2*100).toFixed(0)}%`:`${(p.rate*100).toFixed(0)}%`;
                          const vals = grp.group==="doctor"
                            ? [Math.round(ps.monthHours), fmtFull(ps.revenue), deduction>0?`−${fmtFull(deduction)}`:"—", fmtFull(base), rateLabel, fmtFull(ps.salary), ps.revenue>0?`${(ps.salary/ps.revenue*100).toFixed(1)}%`:"—"]
                            : [Math.round(ps.monthHours), "—", "—", "—", rateLabel, fmtFull(ps.salary), "—"];
                          return (
                            <tr key={p.id} style={{ background:i%2===0?"#fff":"#fafaf9", borderBottom:`1px solid ${C.border}` }}>
                              <td style={{ padding:"9px 12px" }}>
                                <div style={{ display:"flex", alignItems:"center", gap:7 }}>
                                  <div style={{ width:8, height:8, borderRadius:"50%", background:p.color }} />
                                  <span style={{ fontWeight:600 }}>{p.name}</span>
                                </div>
                              </td>
                              {vals.map((v,ci)=>(
                                <td key={ci} style={{ padding:"9px 12px", textAlign:"right", color:ci===5?C.amber:ci===1&&grp.group==="doctor"?C.green:C.text, fontWeight:ci===5||ci===1?600:400 }}>{v}</td>
                              ))}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })}

              {/* P&L summary */}
              <div style={{ ...card, padding:20 }}>
                <div style={{ fontSize:13, fontWeight:700, marginBottom:16, paddingBottom:12, borderBottom:`1px solid ${C.border}` }}>P&L за месяц</div>
                {[
                  { label:"Выручка (врачи)", value:stats.totalRevenue, color:C.green, bold:true },
                  { label:`ФОТ всех (${(stats.totalSalary/(stats.totalRevenue||1)*100).toFixed(1)}%)`, value:-stats.totalSalary, color:C.red },
                  { label:`Наркоз (${expenses.anesthesia_pct}%)`, value:-stats.anesthesia, color:C.red },
                  { label:"Аренда", value:-expenses.rent, color:C.red },
                  { label:"Маркетинг", value:-expenses.marketing, color:C.red },
                  { label:"Материалы", value:-expenses.materials, color:C.red },
                  { label:"Налог 3%", value:-stats.tax, color:C.amber },
                  { label:"Комиссии банков 2%", value:-stats.bankFee, color:C.amber },
                  { label:"Прочее", value:-expenses.other, color:C.red },
                  { label:"ОПЕРАЦ. ПРИБЫЛЬ", value:stats.profit, color:stats.profit>0?C.green:C.red, bold:true, border:true },
                ].map((row,i)=>(
                  <div key={i} style={{ display:"flex", justifyContent:"space-between", padding:"7px 4px", borderTop:row.border?`2px solid ${C.border2}`:"none", marginTop:row.border?8:0, background:row.bold&&!row.border?"#f0fdf4":"transparent", borderRadius:row.bold?6:0, paddingLeft:row.bold?8:4, paddingRight:row.bold?8:4 }}>
                    <span style={{ color:row.bold?C.text:C.textSub, fontWeight:row.bold?700:400 }}>{row.label}</span>
                    <span style={{ color:row.color, fontWeight:row.bold?700:500, fontSize:row.bold?14:13 }}>{row.value<0?"−":""}{fmtFull(Math.abs(row.value))} тг</span>
                  </div>
                ))}
                <div style={{ display:"flex", justifyContent:"flex-end", marginTop:12 }}>
                  <div style={{ background:stats.profit>0?C.greenBg:C.redBg, border:`1px solid ${stats.profit>0?"#bbf7d0":"#fecaca"}`, borderRadius:8, padding:"8px 18px", color:stats.profit>0?C.green:C.red, fontSize:14, fontWeight:700 }}>Маржа: {stats.margin.toFixed(1)}%</div>
                </div>
              </div>
            </div>

            <div style={{ width:250, flexShrink:0 }}>
              <div style={{ ...card, padding:18 }}>
                <div style={{ fontSize:12, fontWeight:700, color:C.textSub, letterSpacing:1.5, textTransform:"uppercase", marginBottom:16 }}>Расходы</div>
                {[{key:"rent",label:"Аренда (тг)"},{key:"marketing",label:"Маркетинг (тг)"},{key:"materials",label:"Материалы (тг)"},{key:"other",label:"Прочее (тг)"},{key:"anesthesia_pct",label:"Наркоз (%)"}].map(f=>(
                  <div key={f.key} style={{ marginBottom:14 }}>
                    <div style={{ fontSize:11, color:C.textSub, fontWeight:500, marginBottom:5 }}>{f.label}</div>
                    <input type="number" value={expenses[f.key]} onChange={e=>setExpenses(p=>({...p,[f.key]:parseFloat(e.target.value)||0}))}
                      style={{ width:"100%", background:C.bg, border:`1px solid ${C.border2}`, borderRadius:7, padding:"9px 11px", color:C.text, fontSize:13, fontFamily:"inherit", outline:"none", boxSizing:"border-box" }} />
                  </div>
                ))}
                <div style={{ background:C.accentBg, border:"1px solid #bfdbfe", borderRadius:10, padding:14, marginTop:8 }}>
                  <div style={{ fontSize:10, color:C.accent, fontWeight:700, letterSpacing:1.5, textTransform:"uppercase", marginBottom:8 }}>Безубыточность</div>
                  <div style={{ fontSize:12, color:C.textSub, lineHeight:1.8 }}>Фикс. расходы:<br/><strong style={{ color:C.text }}>{fmtFull(expenses.rent+expenses.marketing+expenses.materials+expenses.other)} тг</strong></div>
                  <div style={{ fontSize:12, color:C.textSub, marginTop:8, lineHeight:1.8 }}>Breakeven ≈<br/><strong style={{ color:C.accent, fontSize:15 }}>{fmtFull((expenses.rent+expenses.marketing+expenses.materials+expenses.other)/0.55)} тг/мес</strong></div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ══ WEEK TAB ══ */}
        {activeTab==="week" && (
          <div>
            <div style={{ display:"flex", gap:6, marginBottom:20, flexWrap:"wrap", alignItems:"center" }}>
              <span style={{ fontSize:11, color:C.textMuted, fontWeight:600, letterSpacing:1, textTransform:"uppercase", marginRight:4 }}>Показать:</span>
              {[{id:"all",label:"Все дни"},...DAYS.map((d,i)=>({id:i,label:DAYS_FULL[i]}))].map(f=>(
                <button key={f.id} onClick={()=>setWeekFilter(f.id)} style={{
                  background:weekFilter===f.id?C.accent:C.surface, color:weekFilter===f.id?"#fff":C.textSub,
                  border:`1px solid ${weekFilter===f.id?C.accent:C.border2}`, borderRadius:20, padding:"5px 14px",
                  cursor:"pointer", fontSize:12, fontWeight:600, fontFamily:"inherit", transition:"all 0.15s",
                }}>{f.label}</button>
              ))}
            </div>

            {DAYS.map((day, di) => {
              if (weekFilter !== "all" && weekFilter !== di) return null;
              const dayTotalHours = people.reduce((s,p)=>{const c=schedule[p.id]?.[di];return s+(c?c.hours.size:0);},0);
              const dayRevenue    = doctors.reduce((s,p)=>{const c=schedule[p.id]?.[di];return s+(c?c.hours.size:0);},0) * 4.3/7 * REVENUE_PER_HOUR;
              return (
                <div key={di} style={{ ...card, marginBottom:16, overflow:"hidden", border:di>=5?`1px solid #fde68a`:`1px solid ${C.border}` }}>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 18px", background:di>=5?"#fffbf0":"#fafaf9", borderBottom:`1px solid ${di>=5?"#fde68a":C.border}` }}>
                    <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                      <div style={{ width:38, height:38, borderRadius:10, background:di>=5?C.amberBg:C.accentBg, border:`1px solid ${di>=5?"#fde68a":"#bfdbfe"}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, fontWeight:800, color:di>=5?C.amber:C.accent }}>{day}</div>
                      <div>
                        <div style={{ fontWeight:700, fontSize:15 }}>{DAYS_FULL[di]}</div>
                        <div style={{ fontSize:11, color:C.textMuted, marginTop:1 }}>{dayTotalHours>0?`${dayTotalHours} ч · ~${fmtFull(Math.round(dayRevenue))} тг`:"Нет записей"}</div>
                      </div>
                    </div>
                    <div style={{ display:"flex", gap:5, flexWrap:"wrap", justifyContent:"flex-end", maxWidth:"65%" }}>
                      {people.filter(p=>schedule[p.id]?.[di]?.hours.size>0).map(p=>{
                        const c=schedule[p.id][di];
                        return (
                          <div key={p.id} style={{ display:"flex", alignItems:"center", gap:4, background:p.color+"15", border:`1px solid ${p.color}40`, borderRadius:20, padding:"3px 8px", fontSize:10, fontWeight:600, color:p.color }}>
                            <div style={{ width:5,height:5,borderRadius:"50%",background:p.color }} />
                            {p.role==="anesthesiologist"?"💉":""}{p.name} · {c.hours.size}ч{c.room!==null?` Каб.${ROOMS[c.room]}`:""}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div style={{ padding:"10px 18px 0" }}>
                    <div style={{ display:"flex", gap:2, marginBottom:6, paddingLeft:52 }}>
                      {HOURS.map(h=><div key={h} style={{ flex:1, textAlign:"center", fontSize:9, color:C.textMuted, minWidth:0 }}>{h}</div>)}
                    </div>

                    {ROOMS.map((roomNum,ri)=>{
                      const docOcc={}, anesOcc={};
                      people.forEach(p=>{
                        const c=schedule[p.id]?.[di];
                        if(c&&c.room===ri) c.hours.forEach(h=>{
                          if(p.role==="doctor") docOcc[h]=p;
                          else anesOcc[h]=p;
                        });
                      });
                      const hasAny = Object.keys(docOcc).length>0 || Object.keys(anesOcc).length>0;
                      const isOpen = editSlot&&editSlot.di===di&&editSlot.ri===ri;
                      return (
                        <div key={ri} style={{ marginBottom:8 }}>
                          <div style={{ display:"flex", alignItems:"center", gap:2 }}>
                            <div style={{ width:46, flexShrink:0, display:"flex", alignItems:"center", gap:3 }}>
                              <div style={{ width:26, height:24, borderRadius:5, background:hasAny?roomBgs[ri]:"#f3f2ef", border:`1px solid ${hasAny?roomBorders[ri]:C.border}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:800, color:hasAny?roomColors[ri]:C.textMuted }}>{roomNum}</div>
                              <button onClick={()=>{ if(isOpen){setEditSlot(null);}else{setEditSlot({di,ri});setEditPersonId(people[0]?.id||null);setEditShift("morning");} }} style={{ width:18,height:18,borderRadius:"50%",background:isOpen?C.red:C.accent,border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,color:"#fff",fontWeight:700,flexShrink:0 }}>{isOpen?"×":"+"}</button>
                            </div>
                            {HOURS.map(h=>{
                              const doc2  = docOcc[h];
                              const anes2 = anesOcc[h];
                              const docConf  = stats.conflicts[`${di}-${ri}-${h}-doctor`];
                              const anesConf = stats.conflicts[`${di}-${ri}-${h}-anesthesiologist`];
                              return (
                                <div key={h} style={{ flex:1, height:28, minWidth:0, position:"relative", borderRadius:4, overflow:"hidden", border:`1px solid ${docConf||anesConf?"#ef4444":doc2||anes2?C.border2:C.border}` }}>
                                  {doc2 && <div style={{ position:"absolute", inset:0, background:doc2.color+"30", display:"flex", alignItems:"center", justifyContent:"center", fontSize:7, fontWeight:700, color:doc2.color }}>{doc2.name.slice(0,2)}</div>}
                                  {anes2 && <div style={{ position:"absolute", bottom:0, left:0, right:0, height:10, background:anes2.color+"50", display:"flex", alignItems:"center", justifyContent:"center", fontSize:6, fontWeight:700, color:anes2.color }}>💉</div>}
                                  {(docConf||anesConf) && <div style={{ position:"absolute", inset:0, background:"#fca5a580" }}/>}
                                </div>
                              );
                            })}
                          </div>
                          {isOpen && (
                            <div style={{ marginTop:6, marginLeft:50, background:C.accentBg, border:"1px solid #bfdbfe", borderRadius:10, padding:"12px 14px", display:"flex", alignItems:"center", gap:10, flexWrap:"wrap" }}>
                              <span style={{ fontSize:11, color:C.accent, fontWeight:700 }}>+ Каб.{roomNum}:</span>
                              <select value={editPersonId||""} onChange={e=>setEditPersonId(e.target.value)} style={{ background:C.surface, border:`1px solid ${C.border2}`, borderRadius:6, padding:"5px 10px", fontSize:12, color:C.text, fontFamily:"inherit", cursor:"pointer", outline:"none" }}>
                                <optgroup label="👨‍⚕️ Врачи">{doctors.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>
                                {anesthesists.length>0&&<optgroup label="💉 Анестезиологи">{anesthesists.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>}
                              </select>
                              <select value={editShift} onChange={e=>setEditShift(e.target.value)} style={{ background:C.surface, border:`1px solid ${C.border2}`, borderRadius:6, padding:"5px 10px", fontSize:12, color:C.text, fontFamily:"inherit", cursor:"pointer", outline:"none" }}>
                                <option value="morning">Утро 9–15</option>
                                <option value="evening">Вечер 15–21</option>
                                <option value="full">Весь день 8–21</option>
                              </select>
                              <button onClick={()=>{
                                if(!editPersonId) return;
                                setSchedule(prev=>{
                                  const s=cloneSched(prev);
                                  s[editPersonId][di].room=ri;
                                  const blocked=getBlockedHours(s,editPersonId,di,ri,people);
                                  const [st,en]=editShift==="morning"?[9,15]:editShift==="evening"?[15,21]:[8,21];
                                  for(let h=st;h<en;h++) if(!blocked.has(h)) s[editPersonId][di].hours.add(h);
                                  return s;
                                });
                                setEditSlot(null);
                              }} style={{ background:C.accent, color:"#fff", border:"none", borderRadius:7, padding:"6px 16px", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>Добавить</button>
                              <button onClick={()=>setEditSlot(null)} style={{ background:"transparent", color:C.textMuted, border:`1px solid ${C.border2}`, borderRadius:7, padding:"6px 12px", fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>Отмена</button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {dayTotalHours>0&&(
                    <div style={{ display:"flex", marginTop:6, borderTop:`1px solid ${C.border}` }}>
                      {ROOMS.map((rn,ri)=>{
                        const rh=people.reduce((s,p)=>{const c=schedule[p.id]?.[di];return s+(c&&c.room===ri?c.hours.size:0);},0);
                        if(!rh) return null;
                        return <div key={ri} style={{ flex:rh/dayTotalHours, padding:"5px 10px", fontSize:10, fontWeight:600, color:roomColors[ri], background:roomBgs[ri]+"80", textAlign:"center", whiteSpace:"nowrap" }}>Каб.{rn}: {rh}ч</div>;
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ══ ROOMS TAB ══ */}
        {activeTab==="rooms" && (
          <div>
            <div style={{ fontSize:11, color:C.textMuted, letterSpacing:2, textTransform:"uppercase", fontWeight:600, marginBottom:20 }}>Загрузка кабинетов</div>
            {ROOMS.map((roomNum,ri)=>(
              <div key={ri} style={{ ...card, padding:18, marginBottom:16 }}>
                <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14, paddingBottom:12, borderBottom:`1px solid ${C.border}` }}>
                  <div style={{ width:30, height:30, borderRadius:8, background:roomBgs[ri], border:`1px solid ${roomBorders[ri]}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:15, fontWeight:800, color:roomColors[ri] }}>{roomNum}</div>
                  <span style={{ fontWeight:700, fontSize:14 }}>Кабинет {roomNum}</span>
                </div>
                <div style={{ display:"flex", gap:2, marginBottom:6, paddingLeft:40 }}>
                  {HOURS.map(h=><div key={h} style={{ flex:1, textAlign:"center", fontSize:9, color:C.textMuted }}>{h}</div>)}
                </div>
                {DAYS.map((day,di)=>{
                  const docOcc={}, anesOcc={};
                  people.forEach(p=>{const c=schedule[p.id]?.[di];if(c&&c.room===ri)c.hours.forEach(h=>{if(p.role==="doctor")docOcc[h]=p;else anesOcc[h]=p;});});
                  return (
                    <div key={di} style={{ display:"flex", alignItems:"center", gap:2, marginBottom:4 }}>
                      <div style={{ width:36, fontSize:11, fontWeight:600, color:di>=5?C.amber:C.textSub }}>{day}</div>
                      {HOURS.map(h=>{
                        const d2=docOcc[h], a2=anesOcc[h];
                        const docConf=stats.conflicts[`${di}-${ri}-${h}-doctor`];
                        const anesConf=stats.conflicts[`${di}-${ri}-${h}-anesthesiologist`];
                        return (
                          <div key={h} title={[d2&&`${d2.name}`,a2&&`💉${a2.name}`].filter(Boolean).join(" + ")||""} style={{ flex:1, height:26, position:"relative", borderRadius:4, overflow:"hidden", border:`1px solid ${docConf||anesConf?"#ef4444":d2||a2?C.border2:C.border}` }}>
                            <div style={{ position:"absolute", inset:0, background:docConf?"#fca5a5":d2?d2.color+"25":"#f8f7f4", display:"flex", alignItems:"center", justifyContent:"center", fontSize:7, fontWeight:700, color:d2?d2.color:"transparent" }}>{d2?d2.name.slice(0,2):""}</div>
                            {a2&&<div style={{ position:"absolute", bottom:0, left:0, right:0, height:8, background:a2.color+"60", display:"flex", alignItems:"center", justifyContent:"center", fontSize:6, color:a2.color }}>💉</div>}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
                <div style={{ display:"flex", gap:10, marginTop:10, flexWrap:"wrap" }}>
                  {people.filter(p=>DAYS.some((_,di)=>{const c=schedule[p.id]?.[di];return c&&c.room===ri&&c.hours.size>0;})).map(p=>{
                    const wh=DAYS.reduce((s,_,di)=>{const c=schedule[p.id]?.[di];return s+(c&&c.room===ri?c.hours.size:0);},0);
                    return <span key={p.id} style={{ display:"flex", alignItems:"center", gap:4, fontSize:11, color:C.textSub }}><span style={{ width:8,height:8,borderRadius:"50%",background:p.color,display:"inline-block" }}/>{p.role==="anesthesiologist"?"💉":""}{p.name}: <strong>{wh}ч/нед</strong></span>;
                  })}
                </div>
              </div>
            ))}
            {conflictCount>0&&(
              <div style={{ background:C.redBg, border:"1px solid #fecaca", borderRadius:10, padding:16 }}>
                <div style={{ color:C.red, fontWeight:700, marginBottom:8 }}>⚠️ Конфликты ({conflictCount}) — один тип сотрудника в одном месте одновременно</div>
                {Object.entries(stats.conflicts).slice(0,5).map(([key,names])=>{
                  const [di,ri,h,role]=key.split("-");
                  return <div key={key} style={{ color:"#991b1b", fontSize:12, marginBottom:4 }}>{DAYS_FULL[di]}, Каб.{ROOMS[ri]}, {h}:00 [{role==="doctor"?"Врачи":"Анест."}] — {names.join(" и ")}</div>;
                })}
                {conflictCount>5&&<div style={{ color:C.textMuted, fontSize:11, marginTop:4 }}>+ ещё {conflictCount-5}...</div>}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
