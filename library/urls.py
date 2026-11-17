from django.urls import path
from . import views

urlpatterns = [
    path("auth/csrf/", views.csrf, name="csrf"),
    path("auth/register/", views.register, name="register"),
    path("auth/login/", views.login_view, name="login"),
    path("auth/logout/", views.logout_view, name="logout"),
    path("auth/me/", views.me, name="me"),
    path("books/", views.books, name="books"),
    path("books/<int:book_id>/", views.book_detail, name="book-detail"),
    path("loans/", views.loans, name="loans"),
    path("loans/<int:loan_id>/return/", views.return_book, name="return"),
]
