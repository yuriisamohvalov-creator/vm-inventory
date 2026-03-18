from django.conf import settings
from django.contrib.auth import authenticate
from django.contrib.auth.models import update_last_login
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .rbac import get_user_roles, role_labels_for_user, sync_user_roles


def _apply_ldap_role_mapping_if_present(user, provider, username):
    """
    Reserved for future LDAP role model: map LDAP groups to local roles.
    Activated only when provider can return groups and mapping is configured.
    """
    role_map = getattr(settings, 'LDAP_ROLE_GROUP_MAP', None) or {}
    if not role_map or not hasattr(provider, 'get_user_groups'):
        return

    ldap_groups = provider.get_user_groups(username=username, user=user) or []
    ldap_group_set = {str(g).strip().lower() for g in ldap_groups if str(g).strip()}
    resolved_roles = []
    for role, groups in role_map.items():
        for group_name in groups or []:
            if str(group_name).strip().lower() in ldap_group_set:
                resolved_roles.append(role)
                break
    if resolved_roles:
        sync_user_roles(user, resolved_roles)


def _serialize_user(user):
    return {
        'id': user.id,
        'username': user.username,
        'roles': get_user_roles(user),
        'role_labels': role_labels_for_user(user),
        'is_superuser': user.is_superuser,
        'can_export_reports': user.has_perm('inventory.can_export_reports') or user.is_superuser,
    }


class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        username = (request.data.get('username') or '').strip()
        password = request.data.get('password') or ''

        if not username or not password:
            return Response(
                {'detail': 'Укажите username и password.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = authenticate(request=request, username=username, password=password)
        if not user:
            # Optional external provider fallback (e.g. LDAP in future).
            provider = getattr(settings, 'AUTH_PROVIDER', None)
            user = provider.authenticate(request=request, username=username, password=password) if provider else None
            if user:
                _apply_ldap_role_mapping_if_present(user, provider, username)

        if not user:
            return Response({'detail': 'Неверные учетные данные.'}, status=status.HTTP_401_UNAUTHORIZED)
        if not user.is_active:
            return Response({'detail': 'Пользователь отключен.'}, status=status.HTTP_403_FORBIDDEN)

        token, _ = Token.objects.get_or_create(user=user)
        update_last_login(sender=type(user), user=user)
        return Response({'token': token.key, 'user': _serialize_user(user)})


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        Token.objects.filter(user=request.user).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(_serialize_user(request.user))
