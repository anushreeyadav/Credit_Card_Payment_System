"""Site-wide admin configuration: users and admin logs."""

from django.contrib import admin
from django.contrib.admin.models import LogEntry
from django.contrib.auth import get_user_model
from django.contrib.auth.admin import UserAdmin
from django.db.models import Count
from django.http import HttpResponse

from adminlogs import throttle
from adminlogs.mixins import AuditedAdminMixin
from adminlogs.models import AdminLog
from cards.admin import CardInline

admin.site.site_header = 'Credit Card Payment System Admin'
admin.site.site_title = 'Credit Card Payment System Admin'
admin.site.index_title = 'Administration'


def _throttled_login(request, extra_context=None, _login=admin.site.login):
    """Admin login with brute-force lockout (see adminlogs/throttle.py)."""
    if request.method == 'POST' and throttle.is_locked(request):
        AdminLog.record(
            AdminLog.Action.LOGIN_FAILED, request=request,
            username=request.POST.get('username', ''), locked_out=True,
        )
        return HttpResponse(
            'Too many failed login attempts. Please try again later.',
            status=429, content_type='text/plain; charset=utf-8',
        )
    return _login(request, extra_context)


# AdminSite.get_urls() uses self.login, so the instance attribute takes effect.
admin.site.login = _throttled_login

User = get_user_model()


admin.site.unregister(User)


@admin.register(User)
class AppUserAdmin(AuditedAdminMixin, UserAdmin):
    """Django's UserAdmin plus the user's saved cards and counts.

    The password field shows Django's read-only summary (algorithm and a
    masked prefix), never the full hash.
    """

    list_display = ['username', 'email', 'first_name', 'last_name', 'is_staff', 'is_active',
                    'card_count', 'payment_count', 'date_joined', 'last_login']
    list_filter = ['is_staff', 'is_superuser', 'is_active', 'date_joined']
    search_fields = ['username', 'email', 'first_name', 'last_name']
    ordering = ['-date_joined']
    inlines = [CardInline]

    def get_inlines(self, request, obj):
        # A user being created has no cards yet.
        return self.inlines if obj is not None else []

    def get_queryset(self, request):
        return super().get_queryset(request).annotate(
            _card_count=Count('cards', distinct=True),
            _payment_count=Count('payments', distinct=True),
        )

    @admin.display(description='Cards', ordering='_card_count')
    def card_count(self, obj):
        return obj._card_count

    @admin.display(description='Transactions', ordering='_payment_count')
    def payment_count(self, obj):
        return obj._payment_count


@admin.register(LogEntry)
class LogEntryAdmin(admin.ModelAdmin):
    """Read-only audit log of changes made through the admin."""

    list_display = ['action_time', 'user', 'action_label', 'content_type', 'object_repr', 'change_message']
    list_filter = ['action_flag', 'content_type', 'action_time']
    search_fields = ['object_repr', 'change_message', 'user__username']
    date_hierarchy = 'action_time'
    list_select_related = ['user', 'content_type']
    readonly_fields = ['action_time', 'user', 'content_type', 'object_id', 'object_repr', 'action_flag', 'change_message']

    @admin.display(description='Action', ordering='action_flag')
    def action_label(self, obj):
        return {1: 'Added', 2: 'Changed', 3: 'Deleted'}.get(obj.action_flag, obj.action_flag)

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
