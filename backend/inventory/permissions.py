from rest_framework.permissions import BasePermission, SAFE_METHODS

from .rbac import can_export_reports, has_any_known_role, is_admin


class RoleBasedAccessPermission(BasePermission):
    """
    RBAC policy:
    - Administrator: full access
    - Analyst: read-only access to all sections + report export
    """

    message = 'Недостаточно прав для выполнения операции.'

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False

        if is_admin(user):
            return True

        if not has_any_known_role(user):
            return False

        if request.method in SAFE_METHODS:
            if getattr(view, 'requires_report_export_permission', False):
                return can_export_reports(user)
            return True

        return False
