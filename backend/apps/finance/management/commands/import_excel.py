"""
Import historical DailyReport data from quarterly .xlsx cash-book files.

File layout (openpyxl values_only=True, 0-indexed rows/columns):
  rows[0]  — header text ("Остаток за …")
  rows[1]  — opening balances: [1]=kaspi [2]=halyk [3]=cash [4]=usd
  rows[2]  — account labels
  rows[3]  — empty
  rows[4]  — column headers (skip)
  rows[5…] — transaction rows (pos[0] is int) + summary + doctor section + balance section

Transaction columns:
  pos[1]  kaspi  income (>0) or expense (<0)
  pos[2]  kaspi  expense (<0)
  pos[3]  kaspi  comment
  pos[4]  halyk  income
  pos[5]  halyk  expense
  pos[6]  halyk  comment
  pos[7]  cash   income
  pos[8]  cash   expense
  pos[9]  cash   comment

Closing balance section detected by pos[5] in account-name set:
  pos[5]='Каспи pay'  → pos[6]=kaspi end-balance
  pos[5]='Halyk bank' → pos[6]=halyk end-balance
  pos[5]='Наличные'   → pos[6]=cash  end-balance
  pos[5]='USD'        → pos[6]=usd   end-balance
"""

import re
from datetime import datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction as db_transaction

try:
    import openpyxl
except ImportError:
    openpyxl = None

from apps.finance.models import DailyBalance, DailyReport, DailyTransaction

# ── column layout ──────────────────────────────────────────────────────────────
# (account_slug, income_col, expense_col, comment_col)
ACCOUNT_COLS = [
    ("kaspi_pay", 1, 2, 3),
    ("halyk",     4, 5, 6),
    ("cash",      7, 8, 9),
]

# pos[5] value → account slug for end-balance section
BALANCE_LABEL = {
    "каспи pay":  "kaspi_pay",
    "halyk bank": "halyk",
    "наличные":   "cash",
    "usd":        "usd",
}

# pos[1] string values that mark the start of the doctor-payroll section
DOCTOR_MARKERS = {"врачи", "оплатили", "рентген", "проценты", "оплата"}


# ── helpers ────────────────────────────────────────────────────────────────────

def to_dec(val) -> Decimal | None:
    """Return Decimal if val is a non-zero number, otherwise None."""
    if val is None:
        return None
    if isinstance(val, str):
        return None
    try:
        d = Decimal(str(val))
        return d if d != 0 else None
    except (InvalidOperation, TypeError):
        return None


def parse_sheet_date(title: str):
    """
    "Расчеты 02.06.26 "  → date(2026, 6, 2)
    "Расчеты 30-31.05.26" → date(2026, 5, 30)   (use first day of range)
    Returns None if unparseable.
    """
    clean = title.strip()
    if not clean.startswith("Расчеты "):
        return None
    date_part = clean[len("Расчеты "):].strip()

    # direct parse
    try:
        return datetime.strptime(date_part, "%d.%m.%y").date()
    except ValueError:
        pass

    # range like "30-31.05.26" → take first day
    m = re.match(r"(\d{1,2})-\d{1,2}\.(\d{2}\.\d{2})$", date_part)
    if m:
        try:
            return datetime.strptime(f"{m.group(1)}.{m.group(2)}", "%d.%m.%y").date()
        except ValueError:
            pass

    return None


def parse_sheet(ws) -> dict:
    """
    Parse one worksheet.  Returns:
    {
        "date": date | None,
        "opening": {account: Decimal},
        "closing":  {account: Decimal},
        "transactions": [
            {account, direction, amount: Decimal, comment: str, row_order: int}
        ],
        "skipped_rows": int,
    }
    """
    rows = list(ws.iter_rows(values_only=True))
    result = {
        "date": parse_sheet_date(ws.title),
        "opening": {},
        "closing": {},
        "transactions": [],
        "skipped_rows": 0,
    }

    # ── opening balances (rows[1]) ─────────────────────────────────────────
    if len(rows) > 1:
        ob = rows[1]
        for slug, inc_col, _exp_col, _cmt_col in ACCOUNT_COLS:
            v = to_dec(ob[inc_col] if len(ob) > inc_col else None)
            if v is not None:
                result["opening"][slug] = v
        # USD is at pos[4]
        usd = to_dec(ob[4] if len(ob) > 4 else None)
        if usd is not None:
            result["opening"]["usd"] = usd

    # ── transaction rows (rows[5..]) ───────────────────────────────────────
    row_order = 0
    for row in rows[5:]:
        if not row or len(row) < 4:
            continue

        row0 = row[0]

        # ── detect doctor-payroll section → stop collecting transactions ──
        if row0 is None and isinstance(row[1], str):
            if row[1].strip().lower() in DOCTOR_MARKERS:
                break

        # ── detect closing-balance section ────────────────────────────────
        if len(row) > 6 and isinstance(row[5], str):
            key = row[5].strip().lower()
            if key in BALANCE_LABEL:
                v = to_dec(row[6] if len(row) > 6 else None)
                if v is not None:
                    result["closing"][BALANCE_LABEL[key]] = v
                continue  # keep scanning for more balance rows

        # ── skip non-numbered rows (summary, labels, empty) ───────────────
        if not isinstance(row0, (int, float)):
            continue

        # ── parse transaction columns ─────────────────────────────────────
        for account, inc_col, exp_col, cmt_col in ACCOUNT_COLS:
            comment = ""
            if len(row) > cmt_col and isinstance(row[cmt_col], str):
                comment = row[cmt_col].strip()

            # income column
            inc = to_dec(row[inc_col] if len(row) > inc_col else None)
            if inc is not None:
                if inc > 0:
                    row_order += 1
                    result["transactions"].append({
                        "account":   account,
                        "direction": "income",
                        "amount":    inc,
                        "comment":   comment,
                        "row_order": row_order,
                    })
                else:
                    # negative value in income column → treat as expense
                    row_order += 1
                    result["transactions"].append({
                        "account":   account,
                        "direction": "expense",
                        "amount":    abs(inc),
                        "comment":   comment,
                        "row_order": row_order,
                    })

            # dedicated expense column
            exp = to_dec(row[exp_col] if len(row) > exp_col else None)
            if exp is not None:
                row_order += 1
                result["transactions"].append({
                    "account":   account,
                    "direction": "expense",
                    "amount":    abs(exp),
                    "comment":   comment,
                    "row_order": row_order,
                })

    return result


def save_sheet(parsed: dict, source_file: str, dry_run: bool) -> dict:
    """
    Persist one parsed sheet.  Returns stats dict.
    """
    d = parsed["date"]
    txns = parsed["transactions"]
    stats = {"date": d, "tx_saved": 0, "tx_skipped": 0, "skipped_reason": None}

    if d is None:
        stats["skipped_reason"] = "unparseable date"
        return stats

    if DailyReport.objects.filter(date=d).exists():
        stats["skipped_reason"] = "already imported"
        return stats

    if dry_run:
        stats["tx_saved"] = len(txns)
        return stats

    with db_transaction.atomic():
        report = DailyReport.objects.create(date=d, source_file=source_file)

        # opening balances
        for account, amount in parsed["opening"].items():
            DailyBalance.objects.create(
                report=report,
                account=account,
                balance_start=amount,
                balance_end=Decimal("0"),
            )

        # closing balances — update existing or create
        for account, amount in parsed["closing"].items():
            DailyBalance.objects.update_or_create(
                report=report,
                account=account,
                defaults={"balance_end": amount},
            )
        # ensure any account with only a closing balance exists
        for account, amount in parsed["closing"].items():
            DailyBalance.objects.get_or_create(
                report=report,
                account=account,
                defaults={"balance_start": Decimal("0"), "balance_end": amount},
            )

        # transactions
        for t in txns:
            DailyTransaction.objects.create(
                report=report,
                account=t["account"],
                direction=t["direction"],
                amount=t["amount"],
                comment=t["comment"],
                row_order=t["row_order"],
                source="excel",
            )
            stats["tx_saved"] += 1

    return stats


class Command(BaseCommand):
    help = "Импорт исторических данных кассовой книги из .xlsx файлов"

    def add_arguments(self, parser):
        group = parser.add_mutually_exclusive_group(required=True)
        group.add_argument(
            "--file",
            metavar="PATH",
            help="Путь к одному .xlsx файлу",
        )
        group.add_argument(
            "--dir",
            metavar="PATH",
            help="Путь к директории — импортируются все .xlsx файлы",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Только парсить, не сохранять. Печатает статистику.",
        )

    def handle(self, *args, **options):
        if openpyxl is None:
            raise CommandError("openpyxl не установлен. Выполни: pip install openpyxl")

        dry_run = options["dry_run"]

        # collect files
        if options["file"]:
            files = [Path(options["file"])]
        else:
            d = Path(options["dir"])
            if not d.is_dir():
                raise CommandError(f"Директория не найдена: {d}")
            files = sorted(d.glob("*.xlsx"))

        if not files:
            self.stdout.write(self.style.WARNING("Файлы .xlsx не найдены."))
            return

        total_reports = 0
        total_tx = 0
        total_skipped = 0
        total_unparseable = 0

        for fpath in files:
            if not fpath.exists():
                self.stdout.write(self.style.ERROR(f"  Файл не найден: {fpath}"))
                continue

            self.stdout.write(f"\n{'─'*60}")
            self.stdout.write(f"📂  {fpath.name}")

            try:
                wb = openpyxl.load_workbook(fpath, data_only=True, read_only=True)
            except Exception as e:
                self.stdout.write(self.style.ERROR(f"  Ошибка открытия: {e}"))
                continue

            for sheet_name in wb.sheetnames:
                ws = wb[sheet_name]
                parsed = parse_sheet(ws)
                stats = save_sheet(parsed, fpath.name, dry_run)

                d = stats["date"]
                reason = stats["skipped_reason"]

                if reason == "already imported":
                    self.stdout.write(
                        f"  ⏭  {sheet_name.strip():<30}  {d}  — уже импортирован"
                    )
                    total_skipped += 1
                elif reason == "unparseable date":
                    self.stdout.write(
                        self.style.WARNING(f"  ⚠️  {sheet_name.strip():<30}  — не удалось распознать дату")
                    )
                    total_unparseable += 1
                else:
                    flag = "[dry-run] " if dry_run else ""
                    self.stdout.write(
                        self.style.SUCCESS(
                            f"  ✅  {sheet_name.strip():<30}  {d}  "
                            f"{flag}→ {stats['tx_saved']} транзакций"
                        )
                    )
                    total_reports += 1
                    total_tx += stats["tx_saved"]

            wb.close()

        self.stdout.write(f"\n{'═'*60}")
        if dry_run:
            self.stdout.write(self.style.WARNING("  *** DRY RUN — данные НЕ сохранены ***"))
        self.stdout.write(
            f"  Импортировано дней:    {total_reports}\n"
            f"  Транзакций сохранено:  {total_tx}\n"
            f"  Пропущено (дубли):     {total_skipped}\n"
            f"  Не распознана дата:    {total_unparseable}"
        )
