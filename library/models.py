from datetime import timedelta
from django.conf import settings
from django.db import models
from django.utils import timezone

class Profile(models.Model):
    MEMBER = "member"
    LIBRARIAN = "librarian"
    ROLE_CHOICES = [(MEMBER, "Member"), (LIBRARIAN, "Librarian")]
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="profile")
    role = models.CharField(max_length=12, choices=ROLE_CHOICES, default=MEMBER)

    def __str__(self):
        return f"{self.user.username} ({self.role})"

class Book(models.Model):
    title = models.CharField(max_length=200)
    author = models.CharField(max_length=160)
    isbn = models.CharField(max_length=20, unique=True)
    category = models.CharField(max_length=80, default="General")
    description = models.TextField(blank=True)
    total_copies = models.PositiveIntegerField(default=1)
    created_at = models.DateTimeField(auto_now_add=True)

    @property
    def available_copies(self):
        active = self.loans.filter(returned_at__isnull=True).count()
        return max(0, self.total_copies - active)

    def __str__(self):
        return f"{self.title} — {self.author}"

class Loan(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="loans")
    book = models.ForeignKey(Book, on_delete=models.CASCADE, related_name="loans")
    borrowed_at = models.DateTimeField(default=timezone.now)
    due_at = models.DateTimeField()
    returned_at = models.DateTimeField(null=True, blank=True)
    fine_paid = models.BooleanField(default=False)

    LOAN_DAYS = 14
    FINE_PER_DAY = 5

    def save(self, *args, **kwargs):
        if not self.due_at:
            self.due_at = (self.borrowed_at or timezone.now()) + timedelta(days=self.LOAN_DAYS)
        super().save(*args, **kwargs)

    @property
    def fine_amount(self):
        end = self.returned_at or timezone.now()
        late_days = max(0, (end.date() - self.due_at.date()).days)
        return late_days * self.FINE_PER_DAY

    def __str__(self):
        return f"{self.user.username}: {self.book.title}"
