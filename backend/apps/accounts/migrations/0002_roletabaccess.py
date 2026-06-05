from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0001_initial"),
    ]

    operations = [
        migrations.CreateModel(
            name="RoleTabAccess",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("role", models.CharField(max_length=32, unique=True, verbose_name="Роль")),
                ("tabs", models.JSONField(default=list, verbose_name="Вкладки")),
            ],
            options={
                "verbose_name": "Доступ роли к вкладкам",
                "verbose_name_plural": "Доступ ролей к вкладкам",
            },
        ),
    ]
