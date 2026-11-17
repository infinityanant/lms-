from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("library", "0001_initial")]

    operations = [
        migrations.AddField(
            model_name="profile",
            name="overdue_unblocked",
            field=models.BooleanField(default=False),
        ),
    ]
