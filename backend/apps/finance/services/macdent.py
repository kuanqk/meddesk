import logging

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

    # ── Платежи ────────────────────────────────────────────────────────────

    def get_payments(self, date_from: str, date_to: str) -> list:
        data = self._post("payment", "find", {
            "date_from": date_from,
            "date_to": date_to,
        })
        return data.get("pays", data.get("data", []))

    def get_payment_detail(self, payment_id) -> dict:
        return self._post("payment", "get_detailed", {"id": payment_id})

    # ── Расходы ────────────────────────────────────────────────────────────

    def get_expenses(self, date_from: str, date_to: str) -> list:
        data = self._post("rashodi", "find", {
            "date_from": date_from,
            "date_to": date_to,
        })
        return data.get("rashodi", data.get("data", []))

    # ── Записи пациентов ───────────────────────────────────────────────────

    def get_appointments(self, date_from: str, date_to: str) -> list:
        data = self._post("zapis", "find", {
            "date_from": date_from,
            "date_to": date_to,
        })
        return data.get("zapis", data.get("data", []))

    # ── Врачи ──────────────────────────────────────────────────────────────

    def get_doctors(self) -> list:
        data = self._post("doctor", "find", {})
        return data.get("doctors", data.get("data", []))

    # ── Расписание ─────────────────────────────────────────────────────────

    def get_schedule(self, date_from: str, date_to: str) -> list:
        data = self._post("rasp", "find", {
            "date_from": date_from,
            "date_to": date_to,
        })
        return data.get("rasps", data.get("data", []))
