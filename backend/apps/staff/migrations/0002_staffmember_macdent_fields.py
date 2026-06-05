from decimal import Decimal

import django.core.validators
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("staff", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="staffmember",
            name="macdent_id",
            field=models.CharField(
                blank=True,
                help_text="ID врача в системе MacDent (из doctor/find)",
                max_length=50,
                null=True,
                unique=True,
                verbose_name="ID в MacDent",
            ),
        ),
        migrations.AddField(
            model_name="staffmember",
            name="kpi_threshold",
            field=models.DecimalField(
                decimal_places=2,
                default=Decimal("4500000"),
                help_text="KPI порог для повышенной ставки",
                max_digits=12,
                verbose_name="KPI порог",
            ),
        ),
        migrations.AddField(
            model_name="staffmember",
            name="rate_below_kpi",
            field=models.DecimalField(
                decimal_places=2,
                default=Decimal("30.00"),
                help_text="Ставка % до KPI",
                max_digits=5,
                verbose_name="Ставка до KPI (%)",
            ),
        ),
        migrations.AddField(
            model_name="staffmember",
            name="rate_above_kpi",
            field=models.DecimalField(
                decimal_places=2,
                default=Decimal("35.00"),
                help_text="Ставка % сверх KPI",
                max_digits=5,
                verbose_name="Ставка сверх KPI (%)",
            ),
        ),
    ]
