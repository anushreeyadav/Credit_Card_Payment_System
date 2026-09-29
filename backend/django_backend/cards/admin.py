from django.contrib import admin

from adminlogs.mixins import AuditedAdminMixin
from adminlogs.models import AdminLog

from .models import Card


@admin.register(Card)
class CardAdmin(AuditedAdminMixin, admin.ModelAdmin):
    audit_list_action = AdminLog.Action.CARD_LIST_VIEWED
    audit_detail_action = AdminLog.Action.CARD_VIEWED
    audit_delete_action = AdminLog.Action.CARD_DELETED

    list_display = ['id', 'user', 'card_type', 'masked_number', 'cardholder_name', 'expiry_month', 'expiry_year', 'created_at']
    list_filter = ['card_type', 'created_at']
    search_fields = ['user__username', 'user__email', 'last4', 'cardholder_name']
    list_select_related = ['user']
    date_hierarchy = 'created_at'
    readonly_fields = [f.name for f in Card._meta.fields]

    def has_add_permission(self, request):
        # Cards are added through the API, which handles the full number safely.
        return False

    def has_change_permission(self, request, obj=None):
        return False


class CardInline(admin.TabularInline):
    """Read-only list of a user's saved cards (masked), shown on the user page."""

    model = Card
    fields = ['card_type', 'masked_number', 'cardholder_name', 'expiry_month', 'expiry_year', 'created_at']
    readonly_fields = fields
    extra = 0
    can_delete = False
    show_change_link = True

    def has_add_permission(self, request, obj=None):
        return False

    def has_change_permission(self, request, obj=None):
        return False
