from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("finance", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="dailyreport",
            name="source_file",
            field=models.CharField(
                blank=True,
                help_text="Имя .xlsx файла при импорте через import_excel",
                max_length=255,
                verbose_name="Исходный файл",
            ),
        ),
    ]
