import logging
from datetime import datetime

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

MACDENT_BASE = "https://api-developer.macdent.kz"


class MacDentClient:

    def __init__(self):
        # access_token is the full string including the filial prefix, e.g. "1196:1:xxx"
        self.token = settings.MACDENT_API_TOKEN
        self.filial_id = settings.MACDENT_FILIAL_ID

    def _post(self, group: str, method: str, params: dict = None) -> dict:
        url = f"{MACDENT_BASE}/{group}/{method}"
        payload = {"access_token": self.token, **(params or {})}
        try:
            r = requests.post(url, data=payload, timeout=30)
            r.raise_for_status()
            data = r.json()
            if data.get("isTokenNeedToBeUpdated"):
                logger.error("MacDent: токен устарел, нужна переавторизация")
                return {}
            if not data.get("response"):
                logger.error("MacDent error [%s/%s]: %s", group, method, data.get("error"))
                return {}
            return data
        except requests.RequestException as e:
            logger.error("MacDent request failed [%s/%s]: %s", group, method, e)
            return {}

    def _post_all_pages(self, group: str, method: str, params: dict, result_key: str) -> list:
        """Запросить все страницы и вернуть объединённый список из result_key.

        MacDent отдаёт ответ вида {<result_key>: [...], "count": N,
        "atPage": 1, "maxPage": M, "response": 1}. Параметр следующей
        страницы — {"page": n} в payload POST-запроса.
        """
        params = params or {}
        results: list = []

        first = self._post(group, method, {**params, "page": 1})
        if not first:
            return results

        max_page = int(first.get("maxPage", 1) or 1)
        page_items = first.get(result_key, first.get("data", []))
        results.extend(page_items)
        logger.info(
            "MacDent %s/%s: page %d/%d, %d records",
            group, method, 1, max_page, len(page_items),
        )

        for page in range(2, max_page + 1):
            data = self._post(group, method, {**params, "page": page})
            if not data:
                break
            page_items = data.get(result_key, data.get("data", []))
            results.extend(page_items)
            logger.info(
                "MacDent %s/%s: page %d/%d, %d records",
                group, method, page, max_page, len(page_items),
            )

        return results

    # ── Платежи ────────────────────────────────────────────────────────────

    def get_payments(self, date_from: str, date_to: str) -> list:
        """Платежи за период [date_from; date_to] (обе даты ISO YYYY-MM-DD).

        ВНИМАНИЕ: payment/find НЕ фильтрует по датам на сервере — при любых
        параметрах он отдаёт всю историю (проверено эмпирически). Зато список
        отсортирован по дате убыванию (свежие свер­ху), постранично. Поэтому
        фильтруем на клиенте и прекращаем пагинацию, как только страница
        уходит раньше date_from — дневной синк берёт 1-2 страницы вместо всех.
        """
        d_from = datetime.strptime(date_from, "%Y-%m-%d").date()
        d_to = datetime.strptime(date_to, "%Y-%m-%d").date()

        results: list = []
        page = 1
        while True:
            data = self._post("payment", "find", {"page": page})
            if not data:
                break
            items = data.get("pays", data.get("data", []))
            if not items:
                break

            page_min = None
            for p in items:
                try:
                    d = datetime.strptime(p.get("date", ""), "%d.%m.%Y").date()
                except ValueError:
                    continue
                page_min = d if page_min is None else min(page_min, d)
                if d_from <= d <= d_to:
                    results.append(p)

            max_page = int(data.get("maxPage", 1) or 1)
            # Страницы по убыванию даты: если самая ранняя дата страницы уже
            # раньше начала периода — дальше только старее, выходим.
            if page_min is not None and page_min < d_from:
                break
            if page >= max_page:
                break
            page += 1

        logger.info(
            "MacDent get_payments %s..%s: %d платежей (просмотрено %d стр.)",
            date_from, date_to, len(results), page,
        )
        return results

    def get_payment_detail(self, payment_id) -> dict:
        return self._post("payment", "get_detailed", {"id": payment_id})

    # ── Расходы ────────────────────────────────────────────────────────────

    def get_expenses(self, date_from: str, date_to: str) -> list:
        return self._post_all_pages("rashodi", "find", {
            "date_from": date_from,
            "date_to": date_to,
        }, result_key="rashodi")

    # ── Записи пациентов ───────────────────────────────────────────────────

    def get_appointments(self, date_from: str, date_to: str) -> list:
        return self._post_all_pages("zapis", "find", {
            "date_from": date_from,
            "date_to": date_to,
        }, result_key="zapisi")

    # ── Врачи ──────────────────────────────────────────────────────────────

    def get_doctors(self) -> list:
        data = self._post("doctor", "find", {})
        return data.get("doctors", data.get("data", []))

    # ── Расписание ─────────────────────────────────────────────────────────

    def get_schedule(self, date_from: str, date_to: str) -> list:
        return self._post_all_pages("rasp", "find", {
            "date_from": date_from,
            "date_to": date_to,
        }, result_key="rasps")
