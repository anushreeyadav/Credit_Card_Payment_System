"""ModelAdmin mixin that writes AdminLog entries for admin actions."""

import json

from django.contrib.auth import get_user_model

from .models import AdminLog

# Query parameters worth keeping for list views. Values are scrubbed anyway.
_LIST_PARAMS_IGNORED = {'o', 'p', '_changelist_filters'}


def _changed_fields(message):
    """Field labels from a Django admin change message. Never field values."""
    try:
        entries = json.loads(message) if isinstance(message, str) else message
    except ValueError:
        return []
    fields = []
    for entry in entries or []:
        for kind in ('changed', 'added', 'deleted'):
            detail = entry.get(kind) if isinstance(entry, dict) else None
            if detail:
                fields.extend(detail.get('fields', []) or [detail.get('name', '')])
    return [f for f in fields if f]


class AuditedAdminMixin:
    """Records views, additions, changes and deletions made through this admin.

    Set on the ModelAdmin:
        audit_list_action   AdminLog action for GET of the changelist (or None)
        audit_detail_action AdminLog action for GET of an object's page (or None)
        audit_delete_action AdminLog action for deletions
    """

    audit_list_action = None
    audit_detail_action = None
    audit_delete_action = AdminLog.Action.OBJECT_DELETED

    def _is_user_model(self):
        return self.model is get_user_model()

    # Views
    def changelist_view(self, request, extra_context=None):
        response = super().changelist_view(request, extra_context)
        if self.audit_list_action and request.method == 'GET' and response.status_code == 200:
            params = {k: v for k, v in request.GET.items() if k not in _LIST_PARAMS_IGNORED}
            AdminLog.record(self.audit_list_action, request=request, model=self.model._meta.label, query=params)
        return response

    def change_view(self, request, object_id, form_url='', extra_context=None):
        response = super().change_view(request, object_id, form_url, extra_context)
        if self.audit_detail_action and request.method == 'GET' and response.status_code == 200:
            obj = self.get_object(request, object_id)
            if obj is not None:
                AdminLog.record(self.audit_detail_action, request=request, obj=obj)
        return response

    # Writes (Django calls these after a successful add/change, before a delete)
    def log_addition(self, request, obj, message):
        entry = super().log_addition(request, obj, message)
        action = AdminLog.Action.USER_CREATED if self._is_user_model() else AdminLog.Action.OBJECT_CREATED
        AdminLog.record(action, request=request, obj=obj)
        return entry

    def log_change(self, request, obj, message):
        entry = super().log_change(request, obj, message)
        fields = _changed_fields(message)
        if self._is_user_model():
            password_changed = request.path.rstrip('/').endswith('/password') or any(
                'password' in f.lower() for f in fields
            )
            action = AdminLog.Action.USER_PASSWORD_CHANGED if password_changed else AdminLog.Action.USER_UPDATED
            # Only the names of changed fields are stored, never values.
            fields = [f for f in fields if 'password' not in f.lower()]
        else:
            action = AdminLog.Action.OBJECT_UPDATED
        AdminLog.record(action, request=request, obj=obj, changed_fields=fields)
        return entry

    def log_deletions(self, request, queryset):
        # Called before deletion, so the objects still exist here.
        action = AdminLog.Action.USER_DELETED if self._is_user_model() else self.audit_delete_action
        for obj in queryset:
            AdminLog.record(action, request=request, obj=obj)
        return super().log_deletions(request, queryset)
