from django.contrib import admin
from .models import Book, Loan, Profile

@admin.register(Book)
class BookAdmin(admin.ModelAdmin):
    list_display = ("title", "author", "isbn", "category", "total_copies")
    search_fields = ("title", "author", "isbn")
    list_filter = ("category",)

@admin.register(Loan)
class LoanAdmin(admin.ModelAdmin):
    list_display = ("book", "user", "borrowed_at", "due_at", "returned_at", "fine_paid")
    list_filter = ("returned_at", "fine_paid")

@admin.register(Profile)
class ProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "role", "overdue_unblocked")
    list_filter = ("role", "overdue_unblocked")
    search_fields = ("user__username", "user__email")
