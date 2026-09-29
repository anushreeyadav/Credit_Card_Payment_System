import csv
from datetime import date, timedelta

from django.contrib import admin
from django.core.exceptions import PermissionDenied
from django.db.models import Q
from django.http import HttpResponse
from django.template.response import TemplateResponse
from django.urls import path
from django.utils import timezone

from adminlogs.mixins import AuditedAdminMixin
from adminlogs.models import AdminLog

from .models import Payment
from .summary import daily_summary

# Only these columns are exported. Nothing here can hold a full card number,
# CVV, password or token: the Payment table stores none of them, and user
# data is limited to the username.
CSV_COLUMNS = [
    ('reference', lambda p: p.reference),
    ('username', lambda p: p.user.get_username()),
    ('card_type', lambda p: p.card_type),
    ('masked_card', lambda p: f'**** **** **** {p.card_last4}'),
    ('amount', lambda p: p.amount),
    ('currency', lambda p: p.currency),
    ('status', lambda p: p.status),
    ('failure_reason', lambda p: p.failure_reason),
    ('description', lambda p: p.description),
    ('created_at', lambda p: p.created_at.isoformat()),
    ('updated_at', lambda p: p.updated_at.isoformat()),
]

# Leading characters that make Excel/Sheets treat a cell as a formula.
_FORMULA_PREFIXES = ('=', '+', '-', '@', '\t', '\r')


def _csv_safe(value):
    """Neutralise CSV/formula injection in user-supplied text (e.g. description)."""
    text = str(value)
    if isinstance(value, str) and text.startswith(_FORMULA_PREFIXES):
        return "'" + text
    return text



class StatusFilter(admin.SimpleListFilter):
    title = 'status'
    parameter_name = 'status'

    def lookups(self, request, model_admin):
        return Payment.Status.choices

    def queryset(self, request, queryset):
        return queryset.filter(status=self.value()) if self.value() else queryset


class AmountRangeFilter(admin.SimpleListFilter):
    title = 'amount'
    parameter_name = 'amount_range'
    RANGES = {
        'lt100': ('Under 100', Q(amount__lt=100)),
        '100-1000': ('100 - 1,000', Q(amount__gte=100, amount__lte=1000)),
        '1000-10000': ('1,000 - 10,000', Q(amount__gt=1000, amount__lte=10000)),
        'gt10000': ('Over 10,000', Q(amount__gt=10000)),
    }

    def lookups(self, request, model_admin):
        return [(key, label) for key, (label, _) in self.RANGES.items()]

    def queryset(self, request, queryset):
        if self.value() in self.RANGES:
            return queryset.filter(self.RANGES[self.value()][1])
        return queryset


@admin.register(Payment)
class PaymentAdmin(AuditedAdminMixin, admin.ModelAdmin):
    audit_list_action = AdminLog.Action.TRANSACTION_LIST_VIEWED
    audit_detail_action = AdminLog.Action.TRANSACTION_VIEWED

    list_display = ['reference', 'user', 'status', 'amount', 'currency', 'card_type', 'masked_card',
                    'failure_reason', 'created_at', 'updated_at']
    list_filter = [StatusFilter, AmountRangeFilter, 'currency', 'card_type', 'created_at']
    search_fields = ['reference', 'user__username', 'user__email', 'card_last4']
    date_hierarchy = 'created_at'
    readonly_fields = [f.name for f in Payment._meta.fields]
    list_select_related = ['user']
    actions = ['export_as_csv']

    @admin.display(description='Card')
    def masked_card(self, obj):
        return f'**** **** **** {obj.card_last4}'

    def has_add_permission(self, request):
        # Payments are created by the FastAPI payment service.
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        # Keep the transaction history intact.
        return False

    def get_urls(self):
        summary = path(
            'daily-summary/',
            self.admin_site.admin_view(self.daily_summary_view),
            name='payments_payment_daily_summary',
        )
        return [summary, *super().get_urls()]

    def daily_summary_view(self, request):
        if not self.has_view_permission(request):
            raise PermissionDenied

        today = timezone.localdate()
        error = None
        day = today
        if request.GET.get('date'):
            try:
                day = date.fromisoformat(request.GET['date'])
            except ValueError:
                error = 'Invalid date. Use YYYY-MM-DD. Showing today instead.'

        context = {
            **self.admin_site.each_context(request),
            'title': f'Daily payment summary - {day:%d %b %Y}',
            'opts': self.model._meta,
            'day': day,
            'is_today': day == today,
            'previous_day': day - timedelta(days=1),
            'next_day': day + timedelta(days=1) if day < today else None,
            'summary': daily_summary(day),
            'error': error,
            'time_zone': timezone.get_current_timezone_name(),
        }
        AdminLog.record(AdminLog.Action.DAILY_SUMMARY_VIEWED, request=request, date=day.isoformat())
        return TemplateResponse(request, 'admin/payments/daily_summary.html', context)

    @admin.action(description='Export selected transactions to CSV', permissions=['view'])
    def export_as_csv(self, request, queryset):
        timestamp = timezone.now().strftime('%Y%m%d-%H%M%S')
        response = HttpResponse(content_type='text/csv; charset=utf-8')
        response['Content-Disposition'] = f'attachment; filename="transactions-{timestamp}.csv"'

        writer = csv.writer(response)
        writer.writerow([name for name, _ in CSV_COLUMNS])
        references = []
        for payment in queryset.select_related('user').order_by('-created_at', '-id'):
            writer.writerow([_csv_safe(get(payment)) for _, get in CSV_COLUMNS])
            references.append(payment.reference)

        # The log keeps at most 50 references; row_count is always exact.
        AdminLog.record(
            AdminLog.Action.TRANSACTIONS_EXPORTED,
            request=request,
            row_count=len(references),
            references=references,
            columns=[name for name, _ in CSV_COLUMNS],
        )
        return response
