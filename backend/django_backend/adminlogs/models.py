from django.conf import settings
from django.db import models

from .sanitize import scrub, scrub_text


class AdminLog(models.Model):
    """Audit trail of administrative actions.

    Always create entries through AdminLog.record(), which scrubs all text and
    metadata so no password, CVV, card number, token or secret is stored.
    """

    class Action(models.TextChoices):
        LOGIN = 'login', 'Admin login'
        LOGIN_FAILED = 'login_failed', 'Failed admin login'
        LOGOUT = 'logout', 'Admin logout'
        USER_LIST_VIEWED = 'user_list_viewed', 'User list viewed'
        USER_CREATED = 'user_created', 'User created'
        USER_UPDATED = 'user_updated', 'User updated'
        USER_PASSWORD_CHANGED = 'user_password_changed', 'User password changed'
        USER_DELETED = 'user_deleted', 'User deleted'
        CARD_LIST_VIEWED = 'card_list_viewed', 'Card list viewed'
        CARD_VIEWED = 'card_viewed', 'Card viewed'
        CARD_DELETED = 'card_deleted', 'Card deleted'
        TRANSACTION_LIST_VIEWED = 'transaction_list_viewed', 'Transaction list viewed'
        TRANSACTION_VIEWED = 'transaction_viewed', 'Transaction viewed'
        TRANSACTIONS_EXPORTED = 'transactions_exported', 'Transactions exported (CSV)'
        DAILY_SUMMARY_VIEWED = 'daily_summary_viewed', 'Daily summary viewed'
        ADMIN_LOGS_VIEWED = 'admin_logs_viewed', 'Admin logs viewed'
        OBJECT_CREATED = 'object_created', 'Object created'
        OBJECT_UPDATED = 'object_updated', 'Object updated'
        OBJECT_DELETED = 'object_deleted', 'Object deleted'

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='admin_logs',
        help_text='Admin who performed the action. Null for failed logins or deleted admins.',
    )
    # Copied so the log stays readable if the admin account is later deleted.
    username = models.CharField(max_length=150, blank=True)
    action = models.CharField(max_length=40, choices=Action.choices, db_index=True)
    object_type = models.CharField(max_length=100, blank=True)
    object_id = models.CharField(max_length=64, blank=True)
    object_repr = models.CharField(max_length=200, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=200, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        verbose_name = 'admin log'
        verbose_name_plural = 'admin logs'
        ordering = ['-created_at', '-id']
        indexes = [models.Index(fields=['user', '-created_at'], name='adminlog_user_created_idx')]

    def __str__(self):
        return f'{self.created_at:%Y-%m-%d %H:%M:%S} {self.username or "-"} {self.get_action_display()}'

    @classmethod
    def record(cls, action, request=None, user=None, obj=None, username='', **metadata):
        """Create a log entry. All values are scrubbed before saving."""
        if user is None and request is not None:
            request_user = getattr(request, 'user', None)
            if request_user is not None and request_user.is_authenticated:
                user = request_user
        if user is not None and not username:
            username = user.get_username()

        ip_address = user_agent = None
        if request is not None:
            # REMOTE_ADDR only; X-Forwarded-For is client-controlled.
            ip_address = request.META.get('REMOTE_ADDR') or None
            user_agent = request.META.get('HTTP_USER_AGENT', '')

        return cls.objects.create(
            user=user,
            username=scrub_text(username, 150),
            action=action,
            object_type=obj._meta.label if obj is not None else '',
            object_id=scrub_text(obj.pk, 64) if obj is not None else '',
            object_repr=scrub_text(obj) if obj is not None else '',
            ip_address=ip_address,
            user_agent=scrub_text(user_agent or ''),
            metadata=scrub(metadata),
        )
