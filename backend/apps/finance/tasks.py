import logging

from celery import shared_task

from .services.sync import FinanceSyncService

logger = logging.getLogger(__name__)


@shared_task(name="finance.sync_macdent_today")
def sync_macdent_today():
    saved = FinanceSyncService().sync_today()
    logger.info("Celery sync_macdent_today: %d records", saved)
    return saved
