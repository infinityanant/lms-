import django.db.models.deletion
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True
    dependencies = [migrations.swappable_dependency(settings.AUTH_USER_MODEL)]

    operations = [
        migrations.CreateModel(
            name="Book",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("title", models.CharField(max_length=200)),
                ("author", models.CharField(max_length=160)),
                ("isbn", models.CharField(max_length=20, unique=True)),
                ("category", models.CharField(default="General", max_length=80)),
                ("description", models.TextField(blank=True)),
                ("total_copies", models.PositiveIntegerField(default=1)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
        ),
        migrations.CreateModel(
            name="Profile",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("role", models.CharField(choices=[("member", "Member"), ("librarian", "Librarian")], default="member", max_length=12)),
                ("user", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="profile", to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.CreateModel(
            name="Loan",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("borrowed_at", models.DateTimeField(default=django.utils.timezone.now)),
                ("due_at", models.DateTimeField()),
                ("returned_at", models.DateTimeField(blank=True, null=True)),
                ("fine_paid", models.BooleanField(default=False)),
                ("book", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="loans", to="library.book")),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="loans", to=settings.AUTH_USER_MODEL)),
            ],
        ),
    ]
