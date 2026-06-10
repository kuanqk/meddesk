# MedDesk — Full Code & Architecture Review

**Reviewer:** Claude (Fable 5) · **Date:** 2026-06-10
**Scope:** entire repo — backend (Django 5 / DRF), frontend (React 18 / Vite / TS), Docker/nginx, docs, real-world scenario tracing.

---

## 1. Executive summary

The project is in good shape for its age: clean repo layout, sensible Django app split, real historical data imported (470 days / ~10k transactions), working deploy. But there are **two critical data-integrity bugs**, **one systemic security gap**, and **one systemic design contradiction** that should be fixed before the clinic relies on this for money decisions:

| # | Issue | Severity |
|---|---|---|
| C1 | **Finance API has no role enforcement** — any authenticated user (doctor, receptionist) can read the full P&L and write/overwrite cash reports | 🔴 Critical (security) |
| C2 | **MacDent sync overwrites instead of summing** — a doctor's daily revenue = their *last* payment of the day, not the total → payroll will systematically underpay | 🔴 Critical (money) |
| C3 | **Reopening + saving an imported day duplicates every transaction** — excel-sourced rows get re-saved as manual copies → income/expense double in all reports | 🔴 Critical (money) |
| C4 | **Three contradictory salary models coexist** — `salary.py` (hourly, cliff), frontend P&L (% of revenue, progressive, from `SalaryRule`), payroll (% of revenue, progressive, from `StaffMember` KPI fields). Editing rates in the staff UI does *not* affect actual payroll | 🔴 Critical (logic) |
| C5 | **Balance chain breaks silently when a past day is edited** — subsequent days keep stale opening balances; repair is a manual management command | 🟠 High |
| C6 | Deleting a staff member **cascades-deletes their entire revenue and payroll history** | 🟠 High |

Everything else (full lists below) is fixable incrementally.

---

## 2. Business goals (as stated)

From `CLAUDE.md`, `docs/meddesk_finance_architecture.md`, `docs/PROGRESS.md`:

1. Replace the manual pipeline `MacDent → xlsx → Excel → mental math → pay doctors` with: hourly auto-sync from MacDent → automatic ФОТ (payroll) calculation → owner confirms → real-time analytics.
2. Doctor/anesthesiologist scheduling with conflict rules (doctors can't share room+hour; anesthesiologists can't overlap each other but *can* overlap doctors) and a P&L projection.
3. Daily cash-book input across 3 accounts (Kaspi pay / Halyk / Cash) with day close/reopen and audit trail.
4. Role-based access: owner / admin / doctor / anesthesiologist / receptionist — financial data restricted to owner (admin partially).
5. Multi-clinic support ("один пользователь может быть в нескольких клиниках").
6. Stated dev rules: fat models / thin views, business logic in `services.py`, **no schedule in localStorage**, no mixing personal finances with clinic cash.

The review below measures the code against these goals.

---

## 3. Critical findings (detail)

### C1. Finance API is effectively public to any logged-in user

Every finance endpoint uses only `IsAuthenticated`:

- `api/v1/finance/views.py` — `FinanceSummaryView`, `FinanceDailyView`, `FinanceExpensesView`, `FinanceBalancesView`, `DoctorsRevenueView`, `DailyReportView` (GET **and POST**), `PayrollListView` all check nothing beyond authentication.
- Role checks (`_is_owner`, `_is_owner_or_admin`) exist only for *close/reopen/payroll-calculate/confirm*.

The "роль → вкладки" system (`RoleTabAccess`) only controls **which tabs the React app renders**. It is never consulted by the API layer. Consequences, verified against the code:

- A **receptionist or doctor can `GET /api/v1/finance/summary/`** and see the clinic's entire P&L, balances, and every doctor's revenue (`DoctorsRevenueView` even exposes each doctor's `kpi_threshold`).
- Any authenticated user can **`POST /api/v1/finance/daily-report/`** and overwrite the cash book for any open day, including fabricating `opening_balances` (the server trusts the client's openings — see C5).
- Any authenticated user can **CRUD staff and their salary rules**: `StaffMemberViewSet` (`api/v1/staff/views.py:9-24`) is `IsAuthenticated` only. A doctor can `PATCH` their own `salary_rule.base_rate`.
- Any authenticated user can **`PUT /api/v1/scheduler/state/`** and replace the entire schedule *and the expenses block* (rent, marketing, materials — financial data lives inside the scheduler JSON; see N3).
- `PayrollListView` (`finance/views.py:611`) lets any user list everyone's payroll amounts.

**Fix direction:** one DRF permission class per "tab" (or per role capability), driven by the same `RoleTabAccess` data, applied to every view. The tab matrix must be the source of truth for the API, not just the UI.

### C2. MacDent sync: revenue overwritten per payment

`apps/finance/services/sync.py:74-84`:

```python
DoctorRevenue.objects.update_or_create(
    doctor=staff, date=pay_date,
    defaults={"revenue": Decimal(str(p.get("summ", 0))), "patients_count": 1, ...},
)
```

`payment/find` returns **individual payments** (`pays` list). With N payments for one doctor in one day, each iteration *replaces* `revenue` — the stored daily revenue equals the **last payment only**, `patients_count` is always 1, and `raw_data` keeps only the last payment. Since `calculate_payroll` sums `DoctorRevenue`, **payroll will be computed from a fraction of real revenue** the moment the production token arrives.

Also:
- The sync will silently **overwrite `source="manual"`/`"excel"` rows** for the same doctor+date.
- `MacDentSync.raw_response` is never populated.

**Fix:** aggregate payments per (doctor, date) first, then upsert once; or accumulate with `F('revenue') + amount` inside a transaction keyed by sync run.

### C3. Editing a reopened imported day duplicates all transactions

Trace (verified line-by-line):

1. `GET daily-report` (`finance/views.py:367-380`) returns **all** transactions — `source` is *not* included in the payload.
2. `DailyInputTab.loadReport` (frontend, ~line 659) loads every transaction into editable rows.
3. `buildPayload` (~line 746) sends all non-empty rows back.
4. `DailyReportView.post` (`finance/views.py:480`) deletes **only `source="manual"`** rows, then re-creates *everything in the payload* as `source="manual"`.

→ For any of the 470 imported days that the owner reopens and re-saves, **every excel transaction now exists twice** (once as `excel`, once as `manual`). Monthly income/expense for that day doubles in `FinanceSummaryView`, and the recomputed `balance_end` (from payload only) no longer matches the transaction table.

**Fix:** include `source` in the GET payload; treat non-manual rows as read-only on the client; on POST, either replace *all* rows or reconcile by id.

### C4. Three salary models that disagree with each other

| Where | Inputs | Semantics |
|---|---|---|
| `apps/staff/salary.py` (+ its pytest) | `SalaryRule.base_rate/elevated_rate` | **hourly rate × hours**; elevated rate applies to *all* hours once revenue ≥ threshold (cliff) |
| Frontend `ClinicScheduler.calcDoctorSalary` (line 58) | same `SalaryRule` fields, but interpreted as **fractions** (`0.30`) | % of revenue, **progressive** above `threshold2` |
| `FinanceSyncService.calculate_payroll` + `PayrollCalculation` | `StaffMember.kpi_threshold / rate_below_kpi / rate_above_kpi` (percent, `30.00`) | % of revenue, progressive |

Problems this creates:

- `salary.py` is **dead code** — nothing calls it — yet it's the only thing covered by tests (`test_salary.py` asserts the *hourly* semantics). The tests certify behavior the product doesn't use.
- The staff UI edits `SalaryRule`, but **real payroll reads `StaffMember` KPI fields, which are not exposed in `StaffMemberSerializer` at all** (`api/v1/staff/serializers.py` — `kpi_threshold`, `rate_below_kpi`, `rate_above_kpi` missing from `fields`). The owner literally cannot configure actual payroll rates from the app; only via Django admin.
- The P&L tab projection and the payroll module will produce different numbers for the same doctor by design.

**Fix:** pick one model (the KPI progressive one matches the architecture doc), delete `SalaryRule` + `salary.py` or migrate their data, expose KPI fields in the serializer (write-restricted to owner), and make both the P&L projection and payroll call one backend service.

### C5. Opening balances are client-supplied and the chain doesn't propagate

- `DailyReportView.post` (`finance/views.py:497-514`) takes `opening_balances` **from the request body** and stores them as `balance_start`. Any client (or any role — see C1) can set arbitrary openings.
- When you edit a past day, `balance_end` changes, but **no following day is recalculated**. The GET-side bridging (`_build_report_response:393-405`) only applies to days *without* a report. Days that already have reports keep stale `balance_start` forever.
- The repo contains `propagate_balances`, `recalculate_balances`, `fix_opening_balances`, `check_balance_chain` management commands — i.e., the chain is known to drift and is repaired *manually*. That's an operational time bomb for a cash book.

**Fix:** make `balance_start` server-derived (previous day's `balance_end`), recompute forward (or mark subsequent days stale) on any save, and stop accepting openings from the client except for the very first day.

### C6. Hard delete of staff destroys financial history

`StaffMemberViewSet` is a `ModelViewSet` → `DELETE /staff/{id}/` does a real delete. `DoctorRevenue.doctor` and `PayrollCalculation.staff_member` are `on_delete=CASCADE`. Firing a doctor and removing them from the list **erases their revenue rows and confirmed payroll records**, retroactively changing historical analytics.

Also: `get_queryset` filters `is_active=True`, so a deactivated member can never be reactivated through the API (PATCH returns 404), and the model has `is_active` precisely to avoid deletion — the viewset contradicts its own model.

**Fix:** override `destroy` to soft-delete (`is_active=False`); `on_delete=PROTECT` for revenue/payroll FKs.

---

## 4. Other bugs

### Backend

1. **`EmailLoginView` 500 on duplicate emails** (`api/v1/auth/views.py:29`): `User.email` is not unique in the model, `User.objects.get(email__iexact=...)` raises `MultipleObjectsReturned` → unhandled 500. Add a unique constraint on email (case-insensitive) and/or `.filter(...).first()`.
2. **Sync reports "success" when MacDent fails** — `MacDentClient._post` swallows every error and returns `{}` (`services/macdent.py:18-34`); `_post_all_pages` then returns `[]`/partial; `sync_period` marks the run `success` with 0/partial records. Partial page failure (`break` at line 63) silently truncates data mid-sync. Distinguish "no data" from "request failed".
3. **`HourSlot.clean` contradicts the stated business rule** (`apps/schedule/models.py:104-113`): the doctor-conflict query counts *any* HourSlot in the same room+hour — including an anesthesiologist's — as a conflict, but the rule says doctors and anesthesiologists may overlap. The anesthesiologist check also ignores clinic boundaries. (Currently dead code — see N1 — but wrong nonetheless.)
4. **`RoleTabAccess` cache invalidation is per-process** (`apps/accounts/apps.py` + `lru_cache` in `permissions.py`): the `post_save` signal clears the cache only in the worker that handled the PUT. Today gunicorn runs 1 worker so it's latent; the moment you add `-w 4`, permission changes stop applying to other workers until restart. Use a real cache backend or just drop the cache (it saves one tiny query).
5. **`FinanceSummaryView` monthly closing balances** (`views.py:120-135`): takes balances from the literal last `DailyReport` of the month; if that report happens to lack balance rows (possible for manually created reports pre-balance code), the whole month shows `null` even though earlier days have balances.
6. **Expense categorization** (`views.py:63-69`): hardcoded keyword `Q` filters in the view, including personal names ("мурзаб", "калымбет"). Meanwhile the `TransactionCategory` model (with `keywords` JSON field, designed exactly for this) is **never used** anywhere. `icontains="зп"` also matches any word containing "зп". Business logic in the view layer violates the project's own fat-models rule.
7. **`_is_owner` is clinic-agnostic** (`views.py:419-436`): being owner of *any* clinic grants owner powers everywhere. Same for `_is_owner_or_admin` and `get_user_auth_context` (takes `.first()` membership arbitrarily). With one clinic it works; it's a trap for goal #5.
8. **Anesthesiologists never get payroll**: `calculate_payroll` iterates `DoctorRevenue` only — staff without revenue records (anesthesiologists, by definition) get no `PayrollCalculation` at all. The architecture doc says ФОТ is for сотрудники, not only врачи.
9. **`import_excel` ignores the Excel-stated closing balances** for kaspi/halyk/cash (computes its own `end`) and never warns when computed ≠ stated — a free consistency check thrown away. Income+expense in the same row share one comment (minor).
10. **No login throttling** — `EmailLoginView` has no rate limit; combined with HTTP-only deployment (below), credentials are brute-forceable.
11. **Refresh-token rotation without blacklist**: `ROTATE_REFRESH_TOKENS=True` but `rest_framework_simplejwt.token_blacklist` is not installed — old refresh tokens stay valid until expiry, so rotation adds nothing.
12. **Celery is wired but empty**: only `sync_macdent_today` exists; the planned `calculate_monthly_payroll` task doesn't. Beat uses `DatabaseScheduler` with no seeded periodic tasks — nothing runs until someone creates entries by hand in admin (no docs mention this step).

### Frontend

13. **Offline queue / rollback use stale closures** (`DailyInputTab.tsx` ~638-785): the reconnect effect deliberately omits deps, and `doSave`'s rollback captures `prevRows` at callback creation — edits made while offline or during a slow save can be silently lost/reverted.
14. **`calcDoctorSalary` deduction overwrite** (`ClinicScheduler.tsx:58-64`): with both flags set, `deductLab` *replaces* the implant deduction instead of stacking — `base = revenue*(1-IMPLANT_RATE)` is discarded by the next line.
15. **Week-tab day revenue formula is wrong** (`ClinicScheduler.tsx:921`): `dayRevenue = Σhours × 4.3/7 × 33000`. A day's revenue should be that day's hours × rate; multiplying one day's hours by 4.3/7 produces a number with no meaning.
16. **P&L constants hardcoded**: `REVENUE_PER_HOUR=33000` flat for all doctors, tax 3%, bank fee 2%, 4.3 weeks/month, breakeven `fixed/0.55` (assumes a fixed 45% variable share regardless of configured rates). Fine for a sketch, misleading as a "P&L module".
17. **`@ts-nocheck` on the 1085-line `ClinicScheduler.tsx`** — the largest, most logic-heavy component has TypeScript disabled.
18. **Silent failure of `fetchClosedDates`** — on error, lock icons disappear and the day looks editable (server still rejects, but the UX lies).
19. **JWT in `localStorage`** (`api/client.ts`) — XSS-exfiltrable; acceptable trade-off only if you add a CSP and (critically) HTTPS.
20. **Permissions not refreshed on token refresh** — `tabs` from `/auth/me/` persist until reload even if the owner revokes access.
21. **`fetchStaff` reads only page 1** — DRF `PAGE_SIZE=100`; staff #101 silently disappears from the scheduler. Latent, but a one-line fix now beats a mystery later.

---

## 5. Non-logical parts (contradictions, dead code)

- **N1. Two parallel schedule subsystems.** The relational models `Room / WeekTemplate / DaySlot / HourSlot` — with their validation logic and migrations — are **completely unused**. The real scheduler persists a single JSON blob (`SchedulerState`) whose server-side validation is just "people is a list of dicts" (`SchedulerStateSerializer`). All conflict rules live client-side, which contradicts the project's own rule "не писать бизнес-логику в views / не хранить расписание в localStorage" in spirit: the server stores whatever any client sends.
- **N2. Tests certify dead code.** The only meaningful business-logic tests (`test_salary.py`) test `salary.py`, which nothing calls (see C4). `finance/calculator.py` — required by CLAUDE.md to be tested — doesn't exist. Payroll, sync, import, and all API permissions have zero tests.
- **N3. Finance data inside the scheduler blob.** `expenses` (rent, marketing, materials, anesthesia %) lives in `SchedulerState.data`, readable/writable by anyone with the schedule tab — contradicting "финансы только owner/admin" and duplicating the finance module's domain.
- **N4. `TransactionCategory` and `DailyTransaction.category`** exist, are admin-registered, and are never read or written by any code path (categorization is hardcoded in the view, see bug 6).
- **N5. CLAUDE.md describes a different system than the code**: `MonthlyExpenses`/`RevenueRecord` models and endpoints (`/finance/expenses/{month}` PATCH, `/schedule/week/`, `/rooms/`) don't exist; the documented Docker setup differs from the real one. New contributors (or future Claude sessions) will be misled. Same for the API list (no `/rooms/` route exists; `DELETE /schedule/slot/` doesn't exist).
- **N6. `WeekTemplate.week_number` + (year, month)** has no uniqueness constraint and no link to actual dates — even if the relational schedule were revived, the model can't represent "клонировать по месяцам" coherently.
- **N7. `DailyReport.date` is globally `unique=True`** — one cash book for the whole system. Fine today, but it hard-blocks goal #5 (multi-clinic) at the schema level, while other models (StaffMember, Room) dutifully carry `clinic` FKs. The codebase can't decide whether it's multi-tenant.

---

## 6. Fit with business goals

| Goal | Verdict |
|---|---|
| MacDent → auto payroll | ❌ Blocked by C2 (wrong revenue), C4 (rates not configurable via app), bug 8 (anesthesiologists excluded), bug 12 (no scheduled tasks) |
| Scheduling with conflict rules | ⚠️ Works, but rules enforced only in the browser; server accepts anything (N1) |
| Daily cash book + close/reopen | ⚠️ Solid UX, but C3 (duplication), C5 (chain drift), C1 (any role can write) undermine trust in the numbers |
| Role-based access | ❌ UI-only; API is flat `IsAuthenticated` (C1) |
| Multi-clinic | ❌ Schema and permission checks are single-clinic (N7, bug 7) — decide and either commit or remove |
| "Не смешивать личные финансы с кассой" | ⚠️ No personal-finance code exists, but loan/internal-transfer categories (`TransactionCategory.type`) were designed for this separation and are unused — currently займы land in "Прочее" and distort profit |

On that last point: `profit = income − expenses` in `FinanceSummaryView` treats **loan repayments, capex and internal transfers as ordinary P&L items**. The architecture doc explicitly planned category types to separate them. Until then, the "Прибыль" KPI on the dashboard is not operating profit.

---

## 7. Architecture recommendations

Ordered by leverage:

1. **Make authorization a backend concern.** One permission layer (e.g., `RoleTabPermission(tab="finance")`) derived from `RoleTabAccess`, applied to every view; scope every queryset by the user's clinic membership. The current model where the UI is the only gate is the single biggest risk in the system.
2. **One salary engine.** Kill `salary.py` + `SalaryRule` (or migrate their data into the KPI fields), expose KPI fields via the staff API (owner-writable), and have the scheduler P&L call a backend endpoint for projections so the planner and payroll can never diverge.
3. **Make the cash book self-consistent by construction.** Server-derived opening balances, forward recalculation on edit (it's ≤ a few hundred rows — trivial), `source`-aware editing, and optimistic locking (send `updated_at`, reject stale saves) to fix the current last-write-wins between two simultaneous editors (both for daily reports and the whole-blob `SchedulerState`).
4. **Decide on multi-clinic now.** Either add `clinic` FK to `DailyReport`/`DoctorRevenue`/`PayrollCalculation`/`RoleTabAccess` and scope everything, or delete `Clinic`/`ClinicMembership` complexity and run single-tenant. The half-state creates bugs (7, N7) without delivering the feature.
5. **Resolve the schedule duality (N1).** Realistically: delete the unused relational models, keep the JSON snapshot, but validate it server-side (conflict rules in `apps/schedule/services.py`) and move `expenses` out of it into finance. The relational design can return when per-date scheduling (vs. weekly template) is actually needed.
6. **Use `TransactionCategory`.** Move keyword categorization into a service, seed categories (with the personal-name keywords as *data*, not code), store `DailyTransaction.category` at save time, and make the dashboard group by it. Then separate operational vs loan/capex/internal in the profit KPI.
7. **Test what's real.** Minimum set: payroll calculation (incl. KPI boundary `rev == kpi`), sync aggregation (C2 regression), daily-report POST (duplication regression, closed-day rejection), permission matrix per role per endpoint, import_excel on a fixture file. Drop `test_salary.py` with `salary.py`.
8. **Deployment hardening:** HTTPS (the app serves JWTs over plain HTTP on `91.243.71.139:8090` today — with tokens in localStorage this is interceptable), login throttling, `token_blacklist` app, more than 1 gunicorn worker (and fix #4's cache first), `SECRET_KEY` without an insecure default, healthcheck endpoint, Postgres backups (the cash book is now the source of truth for a real business — there is no backup job in the repo).
9. **Update CLAUDE.md** to match reality (N5) — it's the contract for every future AI/dev session; right now it documents phantom models and endpoints.

---

## 8. Real-world scenario walkthroughs

Each scenario traced through the actual code paths.

### S1. "Receptionist enters the day's cash, owner closes the day" ✅/⚠️
Receptionist opens Ввод дня, types transactions, saves → `POST daily-report` upserts, balances computed. Owner clicks 🔒 → `close/` checks `_is_owner` → OK. Closed day rejects further saves (400) and the UI shows read-only. **Works.** Caveats: if `fetchClosedDates` fails silently the lock icon disappears (bug 18); the close check is any-clinic owner (bug 7); and the receptionist could just as well have rewritten *last month's* open days (C1) — nothing restricts the date.

### S2. "Two receptionists enter the same day in parallel" ❌
Both load the day, both add rows, both save. Save #2 deletes all manual rows and writes its own snapshot → **receptionist #1's entries vanish without any warning**. No version check, no merge. Same last-write-wins applies to two people editing the scheduler (whole-blob PUT).

### S3. "Owner fixes a mistake from last Tuesday" ❌
Owner reopens the day, fixes one amount, saves. (a) If the day was excel-imported, **every transaction duplicates** (C3) — with 470 imported days this *will* happen. (b) Tuesday's `balance_end` changes but Wednesday-through-today keep old openings (C5) — the dashboard's "Остаток" no longer matches reality until someone SSHes in and runs `propagate_balances`. The cash book drifts from the actual cash drawer.

### S4. "Production MacDent token arrives, hourly sync goes live" ❌
`sync_macdent_today` runs (if someone remembered to create the beat schedule in admin — bug 12). Dr. Дана sees 6 patients, 6 payments of 50k → `DoctorRevenue.revenue = 50 000`, not 300 000 (C2). Month-end `calculate_payroll` pays her ~30% × (a sixth of her revenue). The doctor notices; trust in the system dies on day one. Additionally: any payment whose `doctor` id has no matching `macdent_id` is skipped with only a server-side log warning — and per `PROGRESS.md`, `macdent_id` hasn't been filled for the real doctors yet.

### S5. "Doctor logs in from home" ⚠️
Login by email works (assuming unique emails — bug 1). Doctor sees only schedule tabs. But with the same JWT in DevTools they can `GET /api/v1/finance/payroll/?month=2026-05` and read **colleagues' salaries**, or `PATCH /api/v1/staff/{their_id}/` to raise their own `salary_rule` rate (C1). Over plain HTTP on a public IP, anyone on-path can also capture the token (rec. 8).

### S6. "Owner reviews May: revenue per doctor, P&L, payroll" ⚠️
DoctorsTab and dashboard render fine from imported data. But: "Прибыль" includes loans/capex (§6); per-doctor revenue covers only doctors with `DoctorRevenue` (excel/manual import of врачи section — the import command actually *stops* at the doctor section marker and never ingests it, so doctor revenue exists only where entered by other means); the P&L tab in the scheduler shows projections from hardcoded 33 000 тг/час that don't reconcile with actual finance data. Three screens, three versions of the truth (C4, bug 16).

### S7. "Clinic opens a second branch" ❌
`DailyReport.date` unique constraint collides immediately; `get_default_clinic()` hardcodes one clinic for the scheduler; `_is_owner` can't distinguish branches (N7, bug 7). Requires the architecture decision in rec. 4 first.

---

## 9. Prioritized action plan

**P0 — before the clinic trusts the numbers**
1. API-level RBAC on finance/staff/scheduler endpoints (C1).
2. Fix MacDent revenue aggregation + add regression test (C2).
3. Fix excel-day duplication: expose `source`, lock non-manual rows (C3).
4. Soft-delete staff; `PROTECT` on revenue/payroll FKs (C6).

**P1 — correctness of money math**
5. Unify the salary model; expose KPI fields; delete dead `salary.py`/`SalaryRule` path (C4).
6. Server-derived opening balances + forward recalc on edit (C5).
7. Optimistic locking on daily-report and scheduler saves (S2).
8. Unique email constraint + login throttling (bug 1, 10).

**P2 — robustness & honesty of analytics**
9. Wire `TransactionCategory`; split operating vs loan/capex in profit.
10. Seed Celery beat schedules in a migration/command; add `calculate_monthly_payroll` task; make sync failures loud.
11. Anesthesiologist payroll path.
12. Permission/payroll/import test suite.

**P3 — structural**
13. HTTPS + token blacklist + secrets hygiene + backups.
14. Multi-clinic decision (commit or strip).
15. Resolve schedule duality; move expenses out of `SchedulerState`.
16. Frontend: re-enable TS in `ClinicScheduler`, fix offline-queue closures, split the two megacomponents, fix `calcDoctorSalary` stacking and the week-tab revenue formula.
17. Rewrite CLAUDE.md to match the actual system.

---

*Methodology: full read of all backend Python (~3.5k lines) and frontend TS/TSX (~4.5k lines), docs, Docker/nginx configs, git history; frontend additionally reviewed by a dedicated exploration agent; all critical claims traced to specific files/lines cited above.*
