from django.core.management.base import BaseCommand
from library.models import Book

BOOKS = [
    ("The Creative Act", "Rick Rubin", "9780593652886", "Creativity", "A way of being, paying attention, and making things."),
    ("Ways of Seeing", "John Berger", "9780140135152", "Art & Design", "A landmark book about how we look at images and the world."),
    ("The Design of Everyday Things", "Don Norman", "9780465050659", "Design", "A classic guide to human-centered design."),
    ("The Little Prince", "Antoine de Saint-Exupéry", "9780156012195", "Fiction", "A pilot meets a young prince who has traveled from a tiny planet."),
    ("Thinking, Fast and Slow", "Daniel Kahneman", "9780374533557", "Psychology", "A tour through the two systems that shape the way we think."),
    ("The Alchemist", "Paulo Coelho", "9780062315007", "Fiction", "A shepherd sets out to find a treasure and discovers a path."),
    ("A Brief History of Time", "Stephen Hawking", "9780553380163", "Science", "An accessible journey through space, time, and the universe."),
    ("Braiding Sweetgrass", "Robin Wall Kimmerer", "9781571313560", "Nature", "Indigenous wisdom, scientific knowledge, and the teachings of plants."),
]

class Command(BaseCommand):
    help = "Add a small starter collection to the library (existing ISBNs are left alone)."

    def handle(self, *args, **options):
        added = 0
        for title, author, isbn, category, description in BOOKS:
            _, created = Book.objects.get_or_create(isbn=isbn, defaults={
                "title": title, "author": author, "category": category,
                "description": description, "total_copies": 3,
            })
            added += int(created)
        self.stdout.write(self.style.SUCCESS(f"Added {added} starter books."))
