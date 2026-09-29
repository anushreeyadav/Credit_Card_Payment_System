"""Daily payment statistics, shared by the Django admin page and the admin API."""

from datetime import datetime, time, timedelta
from decimal import Decimal

from django.db.models import Avg, Count, Q, Sum
from django.utils import timezone

from .models import Payment


def _day_range(day):
    start = timezone.make_aware(datetime.combine(day, time.min))
    return start, start + timedelta(days=1)


def _status_counts(payments):
    return payments.aggregate(
        total=Count('id'),
        success=Count('id', filter=Q(status=Payment.Status.SUCCESS)),
        failed=Count('id', filter=Q(status=Payment.Status.FAILED)),
        pending=Count('id', filter=Q(status=Payment.Status.PENDING)),
    )


def daily_summary(day):
    """Aggregate figures for payments created on `day` (server time zone).

    Amounts are totalled per currency - different currencies are never added
    together.
    """
    start, end = _day_range(day)
    payments = Payment.objects.filter(created_at__gte=start, created_at__lt=end)

    counts = _status_counts(payments)
    completed = counts['success'] + counts['failed']
    counts['success_rate'] = round(100 * counts['success'] / completed, 1) if completed else None

    successful_amounts = list(
        payments.filter(status=Payment.Status.SUCCESS)
        .values('currency')
        .annotate(total_amount=Sum('amount'), count=Count('id'), average_amount=Avg('amount'))
        .order_by('currency')
    )
    for row in successful_amounts:
        row['average_amount'] = row['average_amount'].quantize(Decimal('0.01'))
    return {**counts, 'successful_amounts': successful_amounts}


def recent_days(last_day, days=7):
    """Status counts for each of the `days` days ending on `last_day`, newest first."""
    result = []
    for offset in range(days):
        day = last_day - timedelta(days=offset)
        start, end = _day_range(day)
        counts = _status_counts(Payment.objects.filter(created_at__gte=start, created_at__lt=end))
        result.append({'date': day, **counts})
    return result
