import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("finance", "0002_dailyreport_source_file"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="dailyreport",
            name="closed_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="closed_daily_reports",
                to=settings.AUTH_USER_MODEL,
                verbose_name="Закрыл",
            ),
        ),
        migrations.AddField(
            model_name="dailyreport",
            name="closed_at",
            field=models.DateTimeField(
                blank=True, null=True, verbose_name="Дата закрытия"
            ),
        ),
    ]
