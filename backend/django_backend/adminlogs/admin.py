import json

from django.contrib import admin
from django.utils.html import format_html

from .models import AdminLog


@admin.register(AdminLog)
class AdminLogAdmin(admin.ModelAdmin):
    """Read-only view of the audit trail. Entries cannot be added, edited or deleted."""

    list_display = ['created_at', 'username', 'action', 'object_type', 'object_repr', 'ip_address']
    list_filter = ['action', 'object_type', 'created_at']
    search_fields = ['username', 'object_repr', 'object_id', 'ip_address']
    date_hierarchy = 'created_at'
    list_select_related = ['user']
    fields = ['created_at', 'user', 'username', 'action', 'object_type', 'object_id', 'object_repr',
              'ip_address', 'user_agent', 'metadata_pretty']
    readonly_fields = fields

    @admin.display(description='Metadata')
    def metadata_pretty(self, obj):
        return format_html('<pre style="margin:0">{}</pre>', json.dumps(obj.metadata, indent=2, sort_keys=True))

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
