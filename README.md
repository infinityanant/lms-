# Stacks — Online Library Management System

A college library app built with Django REST Framework and a JavaScript single-page frontend. It supports member accounts, book discovery and search, borrowing and returns, a librarian catalog desk, and automatically calculated late fines.

## Run locally

1. Create and activate a virtual environment, then install dependencies in PowerShell:

   ```powershell
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   ```

2. Create the database and load the example collection:

   ```powershell
   python manage.py migrate
   python manage.py seed_books
   ```

3. Create a staff account, then run the site:

   ```powershell
   python manage.py createsuperuser
   python manage.py runserver
   ```

   Visit http://127.0.0.1:8000. The superuser is treated as a librarian. To promote another account, use Django admin at `/admin/` and change its Profile role to `librarian` (or mark its user as staff).

New registrations always get the Member role. The catalog can be browsed without signing in, while the dashboard, loan history, borrowing, and returns require a session.

## Borrowing rules

- A member may have up to five active loans and one active copy of a title at a time.
- Members can select a title from its catalog card and borrow it. Superusers can check out any catalog title, including titles with no copies available, without the member loan limits.
- A loan is due 14 days after checkout.
- A late return accrues ₹5 per calendar day after the due date. The amount is calculated when the loan is viewed or returned.
- Librarians can add and edit books. A book with borrowing history cannot be deleted, and the copy count cannot be reduced below the copies currently on loan.

## API overview

All write endpoints use Django session authentication and CSRF protection.

| Method | Endpoint | Access |
| --- | --- | --- |
| POST | `/api/auth/register/` | Public; creates a Member |
| POST | `/api/auth/login/` | Public |
| POST | `/api/auth/logout/` | Signed in |
| GET | `/api/auth/me/` | Signed in |
| GET | `/api/books/?q=...&category=...` | Public |
| POST | `/api/books/` | Librarian |
| GET, PUT, DELETE | `/api/books/<id>/` | Read public; changes librarian |
| GET, POST | `/api/loans/` | Signed in; POST borrows a book |
| POST | `/api/loans/<id>/return/` | Borrower or librarian |

## Production note

Before deployment, set a private `SECRET_KEY`, disable `DEBUG`, configure `ALLOWED_HOSTS`, serve static files, and use a production database and HTTPS.
