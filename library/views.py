import json
from datetime import timedelta
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.models import User
from django.db import transaction
from django.db.utils import IntegrityError
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import ensure_csrf_cookie, csrf_protect
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework import status
from .models import Book, Loan, Profile

def parse_body(request):
    try:
        return json.loads(request.body or "{}")
    except (json.JSONDecodeError, UnicodeDecodeError):
        return None

def librarian(user):
    return user.is_staff or (hasattr(user, "profile") and user.profile.role == Profile.LIBRARIAN)

def user_is_blocked(user):
    if user.is_superuser or (hasattr(user, "profile") and user.profile.overdue_unblocked):
        return False
    return Loan.objects.filter(
        user=user, returned_at__isnull=True, due_at__lt=timezone.now()
    ).exists()

def user_data(user):
    role = "librarian" if librarian(user) else "member"
    return {"id": user.id, "username": user.username, "name": user.get_full_name() or user.username,
            "email": user.email, "role": role, "is_superuser": user.is_superuser,
            "blocked": user_is_blocked(user)}

def book_data(book, superuser=False):
    available = book.available_copies
    return {"id": book.id, "title": book.title, "author": book.author, "isbn": book.isbn,
            "category": book.category, "description": book.description,
            "total_copies": book.total_copies, "available_copies": available,
            "can_borrow": available > 0 or superuser}

def loan_data(loan, blocked_user_ids=None):
    return {"id": loan.id, "book": book_data(loan.book), "borrowed_at": loan.borrowed_at.isoformat(),
            "username": loan.user.username, "borrower_id": loan.user_id,
            "user_blocked": loan.user_id in (blocked_user_ids or set()),
            "due_at": loan.due_at.isoformat(),
            "returned_at": loan.returned_at.isoformat() if loan.returned_at else None,
            "fine": loan.fine_amount, "fine_paid": loan.fine_paid,
            "is_overdue": loan.returned_at is None and loan.due_at < timezone.now()}

@ensure_csrf_cookie
@api_view(["GET"])
@permission_classes([AllowAny])
def csrf(request):
    return Response({"detail": "CSRF cookie set"})

@csrf_protect
@api_view(["POST"])
@permission_classes([AllowAny])
def register(request):
    data = parse_body(request)
    if data is None:
        return Response({"detail": "Invalid JSON."}, status=400)
    username, password = str(data.get("username", "")).strip(), data.get("password", "")
    email = str(data.get("email", "")).strip()
    if not username or not password:
        return Response({"detail": "Username and password are required."}, status=400)
    if len(password) < 8:
        return Response({"detail": "Password must be at least 8 characters."}, status=400)
    if User.objects.filter(username__iexact=username).exists():
        return Response({"detail": "That username is already taken."}, status=400)
    user = User.objects.create_user(username=username, password=password, email=email,
                                    first_name=str(data.get("name", "")).strip()[:150])
    Profile.objects.create(user=user, role=Profile.MEMBER)
    login(request, user)
    return Response({"user": user_data(user)}, status=201)

@csrf_protect
@api_view(["POST"])
@permission_classes([AllowAny])
def login_view(request):
    data = parse_body(request)
    if data is None:
        return Response({"detail": "Invalid JSON."}, status=400)
    user = authenticate(request, username=str(data.get("username", "")).strip(), password=data.get("password", ""))
    if user is None:
        return Response({"detail": "The username or password is incorrect."}, status=400)
    login(request, user)
    return Response({"user": user_data(user)})

@api_view(["POST"])
def logout_view(request):
    logout(request)
    return Response({"detail": "Signed out."})

@api_view(["GET"])
def me(request):
    return Response({"user": user_data(request.user)})

@api_view(["GET", "POST"])
@permission_classes([AllowAny])
def books(request):
    if request.method == "GET":
        queryset = Book.objects.all().order_by("title")
        query = request.query_params.get("q", "").strip()
        category = request.query_params.get("category", "").strip()
        if query:
            from django.db.models import Q
            queryset = queryset.filter(Q(title__icontains=query) | Q(author__icontains=query) | Q(isbn__icontains=query))
        if category:
            queryset = queryset.filter(category__iexact=category)
        return Response([book_data(book, superuser=request.user.is_authenticated and request.user.is_superuser) for book in queryset])
    if not request.user.is_authenticated:
        return Response({"detail": "Please sign in first."}, status=401)
    if not librarian(request.user):
        return Response({"detail": "Only librarians can manage the catalog."}, status=403)
    return save_book(request, Book())

@api_view(["GET", "PUT", "PATCH", "DELETE"])
@permission_classes([AllowAny])
def book_detail(request, book_id):
    try:
        book = Book.objects.get(pk=book_id)
    except Book.DoesNotExist:
        return Response({"detail": "Book not found."}, status=404)
    if request.method == "GET":
        return Response(book_data(book))
    if not request.user.is_authenticated:
        return Response({"detail": "Please sign in first."}, status=401)
    if not librarian(request.user):
        return Response({"detail": "Only librarians can manage the catalog."}, status=403)
    if request.method == "DELETE":
        if book.loans.exists():
            return Response({"detail": "Books with borrowing history cannot be deleted."}, status=400)
        book.delete()
        return Response(status=204)
    return save_book(request, book)

def save_book(request, book):
    data = parse_body(request)
    if data is None:
        return Response({"detail": "Invalid JSON."}, status=400)
    for field in ("title", "author", "isbn", "category", "description"):
        if field in data:
            setattr(book, field, str(data[field]).strip())
    if not book.title or not book.author or not book.isbn:
        return Response({"detail": "Title, author, and ISBN are required."}, status=400)
    is_new = book.pk is None
    try:
        copies = int(data.get("total_copies", book.total_copies or 1))
        if copies < 1:
            raise ValueError
        active_loans = book.loans.filter(returned_at__isnull=True).count() if book.pk else 0
        if copies < active_loans:
            return Response({"detail": f"Copies cannot be fewer than the {active_loans} copies currently on loan."}, status=400)
        book.total_copies = copies
        book.save()
    except (TypeError, ValueError):
        return Response({"detail": "Total copies must be a whole number greater than zero."}, status=400)
    except IntegrityError:
        return Response({"detail": "That ISBN is already in the catalog."}, status=400)
    return Response(book_data(book), status=201 if is_new else 200)

@api_view(["GET", "POST"])
def loans(request):
    if request.method == "GET":
        queryset = Loan.objects.select_related("book", "user").order_by("-borrowed_at")
        if not librarian(request.user):
            queryset = queryset.filter(user=request.user)
        blocked_user_ids = set(Loan.objects.filter(
            returned_at__isnull=True, due_at__lt=timezone.now()
        ).exclude(user__is_superuser=True).exclude(
            user__profile__overdue_unblocked=True
        ).values_list("user_id", flat=True))
        return Response([loan_data(loan, blocked_user_ids) for loan in queryset])
    if user_is_blocked(request.user):
        return Response({"detail": "Borrowing is blocked while you have an overdue book. Return it to borrow again."}, status=403)
    data = parse_body(request)
    if data is None:
        return Response({"detail": "Invalid JSON."}, status=400)
    try:
        book_id = int(data.get("book_id"))
    except (TypeError, ValueError):
        return Response({"detail": "Choose a book to borrow."}, status=400)
    with transaction.atomic():
        try:
            book = Book.objects.select_for_update().get(pk=book_id)
        except Book.DoesNotExist:
            return Response({"detail": "Book not found."}, status=404)
        active = Loan.objects.filter(user=request.user, returned_at__isnull=True).count()
        if active >= 5 and not request.user.is_superuser:
            return Response({"detail": "You have reached the limit of 5 active loans."}, status=400)
        if Loan.objects.filter(user=request.user, book=book, returned_at__isnull=True).exists() and not request.user.is_superuser:
            return Response({"detail": "You already have this book on loan."}, status=400)
        if book.available_copies < 1 and not request.user.is_superuser:
            return Response({"detail": "No copies are available right now."}, status=400)
        loan = Loan.objects.create(user=request.user, book=book, due_at=timezone.now() + timedelta(days=Loan.LOAN_DAYS))
    return Response(loan_data(loan), status=201)

@api_view(["POST"])
def return_book(request, loan_id):
    try:
        loan = Loan.objects.select_related("book", "user").get(pk=loan_id)
    except Loan.DoesNotExist:
        return Response({"detail": "Loan not found."}, status=404)
    if loan.user_id != request.user.id and not librarian(request.user):
        return Response({"detail": "You cannot return another member's book."}, status=403)
    if loan.returned_at:
        return Response({"detail": "This book has already been returned."}, status=400)
    loan.returned_at = timezone.now()
    loan.save(update_fields=["returned_at"])
    if hasattr(loan.user, "profile") and loan.user.profile.overdue_unblocked and not Loan.objects.filter(
        user=loan.user, returned_at__isnull=True, due_at__lt=timezone.now()
    ).exists():
        loan.user.profile.overdue_unblocked = False
        loan.user.profile.save(update_fields=["overdue_unblocked"])
    return Response(loan_data(loan))

@api_view(["POST"])
def unblock_user(request, user_id):
    if not request.user.is_superuser:
        return Response({"detail": "Only a superuser can unblock borrowing."}, status=403)
    try:
        user = User.objects.select_related("profile").get(pk=user_id)
    except User.DoesNotExist:
        return Response({"detail": "User not found."}, status=404)
    if user.is_superuser:
        return Response({"detail": "Superuser accounts cannot be blocked."}, status=400)
    overdue_exists = Loan.objects.filter(user=user, returned_at__isnull=True, due_at__lt=timezone.now()).exists()
    if not overdue_exists:
        return Response({"detail": "This user has no overdue active loans."}, status=400)
    profile, _ = Profile.objects.get_or_create(user=user)
    profile.overdue_unblocked = True
    profile.save(update_fields=["overdue_unblocked"])
    return Response({"user": user_data(user), "detail": "Borrowing access restored until overdue books are returned."})
