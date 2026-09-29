"""Login/logout auditing and brute-force counting for the admin site."""

from django.contrib.auth.signals import user_logged_in, user_logged_out, user_login_failed
from django.dispatch import receiver
from django.urls import reverse

from . import throttle
from .models import AdminLog


def _is_admin_request(request):
    return request is not None and request.path.startswith(reverse('admin:index'))


@receiver(user_logged_in, dispatch_uid='adminlogs_login')
def log_admin_login(sender, request, user, **kwargs):
    if _is_admin_request(request):
        throttle.reset(request)
        AdminLog.record(AdminLog.Action.LOGIN, request=request, user=user)


@receiver(user_logged_out, dispatch_uid='adminlogs_logout')
def log_admin_logout(sender, request, user, **kwargs):
    if _is_admin_request(request) and user is not None:
        AdminLog.record(AdminLog.Action.LOGOUT, request=request, user=user)


@receiver(user_login_failed, dispatch_uid='adminlogs_login_failed')
def log_admin_login_failed(sender, credentials, request=None, **kwargs):
    if _is_admin_request(request):
        throttle.record_failure(request)
        # Only the attempted username; the password is never read.
        AdminLog.record(
            AdminLog.Action.LOGIN_FAILED,
            request=request,
            username=credentials.get('username', ''),
        )
