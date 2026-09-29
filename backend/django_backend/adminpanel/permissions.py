from rest_framework.permissions import BasePermission


class StaffModelPermission(BasePermission):
    """Active staff users holding the Django permission named by the view.

    The view sets `required_permission` (e.g. 'payments.view_payment').
    Superusers hold every permission. Non-staff users are always refused.
    """

    message = 'You do not have permission to view this section.'

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated and user.is_active and user.is_staff):
            return False
        perms = view.get_required_permissions(request)
        return user.has_perms(perms)
