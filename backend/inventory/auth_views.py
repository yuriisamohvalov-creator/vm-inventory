from django.conf import settings
from django.contrib.auth import authenticate
from django.contrib.auth.models import User, update_last_login
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .rbac import ROLE_ADMIN, ROLE_ANALYST, get_user_roles, is_admin, role_labels_for_user, sync_user_roles


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


def _serialize_managed_user(user):
    roles = get_user_roles(user)
    role = ROLE_ADMIN if ROLE_ADMIN in roles else ROLE_ANALYST
    return {
        'id': user.id,
        'username': user.username,
        'role': role,
        'roles': roles,
        'is_active': user.is_active,
        # Reserved for compatibility with existing frontend form.
        'must_change_password': False,
    }


def _to_bool(value, default=False):
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in ('1', 'true', 'yes', 'y', 'on', 'active')
    return bool(value)


class UsersView(APIView):
    permission_classes = [IsAuthenticated]

    def _ensure_admin(self, request):
        if not is_admin(request.user):
            return Response({'detail': 'Недостаточно прав.'}, status=status.HTTP_403_FORBIDDEN)
        return None

    def get(self, request):
        denied = self._ensure_admin(request)
        if denied:
            return denied
        users = User.objects.order_by('username')
        return Response([_serialize_managed_user(u) for u in users])

    def post(self, request):
        denied = self._ensure_admin(request)
        if denied:
            return denied

        username = (request.data.get('username') or '').strip()
        password = request.data.get('password') or ''
        role = (request.data.get('role') or ROLE_ANALYST).strip()
        is_active = _to_bool(request.data.get('is_active', True), default=True)

        if not username:
            return Response({'error': 'Логин обязателен.'}, status=status.HTTP_400_BAD_REQUEST)
        if not password:
            return Response({'error': 'Пароль обязателен.'}, status=status.HTTP_400_BAD_REQUEST)
        if role not in (ROLE_ADMIN, ROLE_ANALYST):
            return Response({'error': 'Недопустимая роль.'}, status=status.HTTP_400_BAD_REQUEST)
        if User.objects.filter(username=username).exists():
            return Response({'error': 'Пользователь с таким логином уже существует.'}, status=status.HTTP_400_BAD_REQUEST)

        user = User.objects.create_user(username=username, password=password, is_active=is_active)
        sync_user_roles(user, [role])
        return Response(_serialize_managed_user(user), status=status.HTTP_201_CREATED)


class UserDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def _ensure_admin(self, request):
        if not is_admin(request.user):
            return Response({'detail': 'Недостаточно прав.'}, status=status.HTTP_403_FORBIDDEN)
        return None

    def patch(self, request, user_id):
        denied = self._ensure_admin(request)
        if denied:
            return denied
        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return Response({'detail': 'Пользователь не найден.'}, status=status.HTTP_404_NOT_FOUND)

        role = request.data.get('role')
        password = request.data.get('password')
        is_active = request.data.get('is_active')

        if role is not None:
            role = str(role).strip()
            if role not in (ROLE_ADMIN, ROLE_ANALYST):
                return Response({'error': 'Недопустимая роль.'}, status=status.HTTP_400_BAD_REQUEST)
            sync_user_roles(user, [role])

        if password:
            user.set_password(password)

        if is_active is not None:
            user.is_active = _to_bool(is_active, default=user.is_active)

        user.save()
        return Response(_serialize_managed_user(user))

    def delete(self, request, user_id):
        denied = self._ensure_admin(request)
        if denied:
            return denied
        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return Response(status=status.HTTP_204_NO_CONTENT)
        user.is_active = False
        user.save(update_fields=['is_active'])
        return Response(status=status.HTTP_204_NO_CONTENT)
