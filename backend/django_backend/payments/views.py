from datetime import datetime, time, timedelta

from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import generics
from rest_framework.pagination import PageNumberPagination

from config.openapi import UNAUTHORIZED, error, validation_error

from .models import Payment
from .serializers import TransactionFilterSerializer, TransactionSerializer


class TransactionPagination(PageNumberPagination):
    page_size = 10
    page_size_query_param = 'page_size'
    max_page_size = 100


TRANSACTION_FILTERS = [
    OpenApiParameter('status', str, enum=['PENDING', 'SUCCESS', 'FAILED'], description='Case-insensitive.'),
    OpenApiParameter('min_amount', OpenApiTypes.DECIMAL, description='Amount >= this value.'),
    OpenApiParameter('max_amount', OpenApiTypes.DECIMAL, description='Amount <= this value.'),
    OpenApiParameter('date_from', OpenApiTypes.DATE, description='YYYY-MM-DD (UTC), inclusive.'),
    OpenApiParameter('date_to', OpenApiTypes.DATE, description='YYYY-MM-DD (UTC), inclusive.'),
]


@extend_schema(
    tags=['Transactions'],
    summary='Your transaction history',
    description='Your own payments only, newest first, paginated (default 10, `page_size` up to 100). '
    'Filters can be combined. Card numbers are masked.',
    parameters=TRANSACTION_FILTERS,
    responses={
        200: TransactionSerializer(many=True),
        400: validation_error({'min_amount': ['Must not be greater than max_amount.']}),
        401: UNAUTHORIZED,
        404: error('`page` is beyond the last page.', 'Invalid page.'),
    },
)
class TransactionListView(generics.ListAPIView):
    """GET /api/transactions/ - the current user's payments, newest first.

    Query parameters (all optional, combinable):
        status      PENDING | SUCCESS | FAILED (case-insensitive)
        min_amount  amount >= value
        max_amount  amount <= value
        date_from   YYYY-MM-DD, created on or after this date
        date_to     YYYY-MM-DD, created on or before this date (inclusive)
        page        page number (default 1)
        page_size   items per page (default 10, max 100)

    Dates are calendar days in the server time zone (TIME_ZONE, UTC).
    Invalid parameters return 400 with per-field errors.
    """

    serializer_class = TransactionSerializer
    pagination_class = TransactionPagination

    def get_queryset(self):
        if getattr(self, 'swagger_fake_view', False):  # OpenAPI schema generation, no real user
            return Payment.objects.none()
        # Always scoped to the requesting user: other users' rows are never visible.
        queryset = Payment.objects.filter(user=self.request.user).order_by('-created_at', '-id')

        filters = TransactionFilterSerializer(data=self.request.query_params)
        filters.is_valid(raise_exception=True)
        params = filters.validated_data

        if 'status' in params:
            queryset = queryset.filter(status=params['status'])
        if 'min_amount' in params:
            queryset = queryset.filter(amount__gte=params['min_amount'])
        if 'max_amount' in params:
            queryset = queryset.filter(amount__lte=params['max_amount'])
        # Half-open datetime range [date_from 00:00, date_to+1 00:00) so the
        # whole of date_to is included and the created_at index can be used.
        if 'date_from' in params:
            queryset = queryset.filter(created_at__gte=_start_of_day(params['date_from']))
        if 'date_to' in params:
            queryset = queryset.filter(created_at__lt=_start_of_day(params['date_to'] + timedelta(days=1)))
        return queryset


def _start_of_day(day):
    return timezone.make_aware(datetime.combine(day, time.min))
