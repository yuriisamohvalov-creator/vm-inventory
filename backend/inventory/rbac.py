from __future__ import annotations

from typing import Iterable


ROLE_ADMIN = 'administrator'
ROLE_ANALYST = 'analyst'

ROLE_GROUP_NAMES = {
    ROLE_ADMIN: 'Administrators',
    ROLE_ANALYST: 'Analysts',
}


def _normalized_group_names(user) -> set[str]:
    if not user or not user.is_authenticated:
        return set()
    return {name.lower() for name in user.groups.values_list('name', flat=True)}


def get_user_roles(user) -> list[str]:
    if not user or not user.is_authenticated:
        return []
    if getattr(user, 'is_superuser', False):
        return [ROLE_ADMIN]

    group_names = _normalized_group_names(user)
    roles: list[str] = []
    for role, group_name in ROLE_GROUP_NAMES.items():
        if group_name.lower() in group_names:
            roles.append(role)
    return roles


def has_any_known_role(user) -> bool:
    return len(get_user_roles(user)) > 0


def is_admin(user) -> bool:
    return ROLE_ADMIN in get_user_roles(user)


def can_export_reports(user) -> bool:
    return is_admin(user) or user.has_perm('inventory.can_export_reports')


def role_labels_for_user(user) -> list[str]:
    labels = []
    for role in get_user_roles(user):
        if role == ROLE_ADMIN:
            labels.append('Администратор')
        elif role == ROLE_ANALYST:
            labels.append('Аналитик')
    return labels


def sync_user_roles(user, roles: Iterable[str]) -> None:
    """
    Replace user's role groups with provided role list.
    This helper is designed for future LDAP group-to-role mapping.
    """
    from django.contrib.auth.models import Group

    role_set = set(roles or [])
    known_group_names = set(ROLE_GROUP_NAMES.values())

    user.groups.remove(*Group.objects.filter(name__in=known_group_names))
    for role in role_set:
        group_name = ROLE_GROUP_NAMES.get(role)
        if not group_name:
            continue
        group, _ = Group.objects.get_or_create(name=group_name)
        user.groups.add(group)
