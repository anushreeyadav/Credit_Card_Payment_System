"""Staff-only JSON API behind the React admin dashboard (/api/admin/...).

Every view requires an active staff user with the matching Django "view"
permission (superusers have all). Views are recorded in AdminLog, whose
record() scrubs anything sensitive from the stored query.
"""

from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Count, Q
from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, extend_schema
from rest_framework import generics, status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken

from adminlogs.models import AdminLog
from cards.models import Card
from payments.models import Payment
from payments.serializers import TransactionFilterSerializer
from payments.summary import daily_summary, recent_days
from payments.views import TransactionPagination, _start_of_day

from config.openapi import FORBIDDEN_ADMIN, UNAUTHORIZED, error, validation_error
from payments.views import TRANSACTION_FILTERS

from .permissions import StaffModelPermission
from .serializers import (
    ActionChoiceSerializer,
    AdminCardSerializer,
    AdminLogSerializer,
    AdminSummarySerializer,
    AdminTransactionSerializer,
    AdminUserSerializer,
    AdminUserUpdateSerializer,
)

ADMIN_ERRORS = {401: UNAUTHORIZED, 403: FORBIDDEN_ADMIN}
SEARCH = OpenApiParameter('search', str, description='Case-insensitive text search (max 100 characters).')


def _admin_doc(summary, description, permission, **kwargs):
    return extend_schema(
        tags=['Admin'], summary=summary,
        description=f'{description}\n\n**Requires:** active staff account with `{permission}` (superusers have all).',
        **kwargs,
    )

User = get_user_model()

# Query parameters not worth recording in the audit log.
_UNLOGGED_PARAMS = {'page', 'page_size'}


class AdminPagination(TransactionPagination):
    page_size = 10
    max_page_size = 100


class AdminAPIView:
    """Common settings: staff permission check + audit logging of list views."""

    permission_classes = [StaffModelPermission]
    pagination_class = AdminPagination
    required_permission = None
    audit_action = None

    def get_required_permissions(self, request):
        return [self.required_permission]

    def audit(self, request, **metadata):
        query = {k: v for k, v in request.query_params.items() if k not in _UNLOGGED_PARAMS}
        AdminLog.record(self.audit_action, request=request, query=query, **metadata)

    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        if self.audit_action:
            self.audit(request)
        return response


def _search(request):
    return request.query_params.get('search', '').strip()[:100]


@_admin_doc(
    'Daily payment summary',
    'Totals for one day (UTC): all, successful, failed and pending payments, success rate, successful '
    'amount per currency, and counts for the last 7 days.',
    'payments.view_payment',
    parameters=[OpenApiParameter('date', OpenApiTypes.DATE, description='YYYY-MM-DD. Default: today (UTC).')],
    responses={200: AdminSummarySerializer, 400: validation_error({'date': 'Use YYYY-MM-DD.'}), **ADMIN_ERRORS},
)
class SummaryView(AdminAPIView, APIView):
    """GET /api/admin/summary/?date=YYYY-MM-DD - daily payment statistics (default: today)."""

    required_permission = 'payments.view_payment'
    audit_action = AdminLog.Action.DAILY_SUMMARY_VIEWED

    def get(self, request):
        raw = request.query_params.get('date')
        try:
            day = date.fromisoformat(raw) if raw else timezone.localdate()
        except ValueError:
            raise ValidationError({'date': 'Use YYYY-MM-DD.'})

        summary = daily_summary(day)
        AdminLog.record(self.audit_action, request=request, date=day.isoformat())
        return Response({
            'date': day,
            'time_zone': timezone.get_current_timezone_name(),
            'total': summary['total'],
            'success': summary['success'],
            'failed': summary['failed'],
            'pending': summary['pending'],
            'success_rate': summary['success_rate'],
            'successful_amounts': [
                {
                    'currency': row['currency'],
                    'count': row['count'],
                    'total_amount': f"{row['total_amount']:.2f}",
                    'average_amount': f"{row['average_amount']:.2f}",
                }
                for row in summary['successful_amounts']
            ],
            'last_7_days': recent_days(day, 7),
        })


@_admin_doc(
    'List users',
    'All accounts with card and transaction counts. Never includes passwords or hashes.',
    'auth.view_user',
    parameters=[
        SEARCH,
        OpenApiParameter('status', str, enum=['active', 'inactive']),
        OpenApiParameter('role', str, enum=['staff', 'customer']),
    ],
    responses={200: AdminUserSerializer(many=True), **ADMIN_ERRORS},
)
class UserListView(AdminAPIView, generics.ListAPIView):
    """GET /api/admin/users/?search=&status=active|inactive&role=staff|customer"""

    serializer_class = AdminUserSerializer
    required_permission = 'auth.view_user'
    audit_action = AdminLog.Action.USER_LIST_VIEWED

    def get_queryset(self):
        qs = User.objects.annotate(
            card_count=Count('cards', distinct=True),
            payment_count=Count('payments', distinct=True),
        ).order_by('-date_joined', '-id')
        if term := _search(self.request):
            qs = qs.filter(
                Q(username__icontains=term) | Q(email__icontains=term)
                | Q(first_name__icontains=term) | Q(last_name__icontains=term)
            )
        state = self.request.query_params.get('status')
        if state in ('active', 'inactive'):
            qs = qs.filter(is_active=(state == 'active'))
        role = self.request.query_params.get('role')
        if role in ('staff', 'customer'):
            qs = qs.filter(is_staff=(role == 'staff'))
        return qs


@_admin_doc(
    'Activate or deactivate a user',
    'Only `is_active` can be changed. Deactivating signs the user out everywhere (their refresh tokens are '
    'blacklisted) and blocks login. You cannot change your own account; only a superuser can change a superuser.',
    'auth.view_user + auth.change_user',
    parameters=[OpenApiParameter('id', int, OpenApiParameter.PATH, description='User id.')],
    request=AdminUserUpdateSerializer,
    responses={
        200: AdminUserSerializer,
        400: validation_error({'is_active': ['This field is required.']}),
        **ADMIN_ERRORS,
        404: error('No such user.', 'No User matches the given query.'),
    },
)
class UserUpdateView(AdminAPIView, APIView):
    """PATCH /api/admin/users/{id}/ {"is_active": bool} - activate or deactivate an account."""

    def get_required_permissions(self, request):
        return ['auth.view_user', 'auth.change_user']

    def patch(self, request, pk):
        target = generics.get_object_or_404(User, pk=pk)
        serializer = AdminUserUpdateSerializer(target, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        if 'is_active' not in serializer.validated_data:
            raise ValidationError({'is_active': 'This field is required.'})
        active = serializer.validated_data['is_active']

        if target.pk == request.user.pk:
            raise PermissionDenied('You cannot change your own account status.')
        if target.is_superuser and not request.user.is_superuser:
            raise PermissionDenied('Only a superuser can change another superuser.')

        with transaction.atomic():
            if target.is_active != active:
                target.is_active = active
                target.save(update_fields=['is_active'])
                if not active:
                    # Sign the user out everywhere: their refresh tokens stop working now.
                    for token in OutstandingToken.objects.filter(user=target):
                        BlacklistedToken.objects.get_or_create(token=token)
                AdminLog.record(
                    AdminLog.Action.USER_UPDATED, request=request, obj=target,
                    changed_fields=['Active'], is_active=active,
                )

        target = User.objects.annotate(
            card_count=Count('cards', distinct=True), payment_count=Count('payments', distinct=True)
        ).get(pk=target.pk)
        return Response(AdminUserSerializer(target).data, status=status.HTTP_200_OK)


@_admin_doc(
    'List all saved cards',
    "Every user's cards, masked only. Search matches username, cardholder or exact last 4 digits.",
    'cards.view_card',
    parameters=[SEARCH, OpenApiParameter('card_type', str, enum=['visa', 'mastercard', 'amex', 'discover', 'rupay'])],
    responses={200: AdminCardSerializer(many=True), **ADMIN_ERRORS},
)
class CardListView(AdminAPIView, generics.ListAPIView):
    """GET /api/admin/cards/?search=&card_type= - saved cards (masked only)."""

    serializer_class = AdminCardSerializer
    required_permission = 'cards.view_card'
    audit_action = AdminLog.Action.CARD_LIST_VIEWED

    def get_queryset(self):
        qs = Card.objects.select_related('user').order_by('-created_at', '-id')
        if term := _search(self.request):
            qs = qs.filter(
                Q(user__username__icontains=term) | Q(cardholder_name__icontains=term) | Q(last4=term)
            )
        card_type = self.request.query_params.get('card_type')
        if card_type in Card.CardType.values:
            qs = qs.filter(card_type=card_type)
        return qs


@_admin_doc(
    'List all transactions',
    "Every user's payments. Search matches the reference id or username; the same filters as "
    '`GET /api/transactions/` apply.',
    'payments.view_payment',
    parameters=[SEARCH, *TRANSACTION_FILTERS],
    responses={
        200: AdminTransactionSerializer(many=True),
        400: validation_error({'status': ['Must be one of: PENDING, SUCCESS, FAILED.']}),
        **ADMIN_ERRORS,
    },
)
class TransactionListView(AdminAPIView, generics.ListAPIView):
    """GET /api/admin/transactions/?search=&status=&min_amount=&max_amount=&date_from=&date_to="""

    serializer_class = AdminTransactionSerializer
    required_permission = 'payments.view_payment'
    audit_action = AdminLog.Action.TRANSACTION_LIST_VIEWED

    def get_queryset(self):
        filters = TransactionFilterSerializer(data=self.request.query_params)
        filters.is_valid(raise_exception=True)
        params = filters.validated_data

        qs = Payment.objects.select_related('user').order_by('-created_at', '-id')
        if term := _search(self.request):
            qs = qs.filter(Q(reference__icontains=term) | Q(user__username__icontains=term))
        if 'status' in params:
            qs = qs.filter(status=params['status'])
        if 'min_amount' in params:
            qs = qs.filter(amount__gte=params['min_amount'])
        if 'max_amount' in params:
            qs = qs.filter(amount__lte=params['max_amount'])
        if 'date_from' in params:
            qs = qs.filter(created_at__gte=_start_of_day(params['date_from']))
        if 'date_to' in params:
            qs = qs.filter(created_at__lt=_start_of_day(params['date_to'] + timedelta(days=1)))
        return qs


@_admin_doc(
    'Admin audit log',
    'Logins, user changes, views and exports made by admins. Metadata was scrubbed of passwords, '
    'card numbers and tokens when recorded.',
    'adminlogs.view_adminlog',
    parameters=[SEARCH, OpenApiParameter('action', str, description='An action value from `GET /api/admin/logs/actions/`.')],
    responses={200: AdminLogSerializer(many=True), **ADMIN_ERRORS},
)
class AdminLogListView(AdminAPIView, generics.ListAPIView):
    """GET /api/admin/logs/?search=&action= - the admin audit trail."""

    serializer_class = AdminLogSerializer
    required_permission = 'adminlogs.view_adminlog'
    audit_action = AdminLog.Action.ADMIN_LOGS_VIEWED

    def get_queryset(self):
        qs = AdminLog.objects.order_by('-created_at', '-id')
        if term := _search(self.request):
            qs = qs.filter(Q(username__icontains=term) | Q(object_repr__icontains=term))
        action = self.request.query_params.get('action')
        if action in AdminLog.Action.values:
            qs = qs.filter(action=action)
        return qs


@_admin_doc(
    'Admin log action types',
    'Values and labels for the `action` filter of the admin log.',
    'adminlogs.view_adminlog',
    responses={200: ActionChoiceSerializer(many=True), **ADMIN_ERRORS},
)
class AdminLogActionsView(AdminAPIView, APIView):
    """GET /api/admin/logs/actions/ - action choices for the filter dropdown."""

    required_permission = 'adminlogs.view_adminlog'

    def get(self, request):
        return Response([{'value': v, 'label': label} for v, label in AdminLog.Action.choices])

