"""
LDAP authentication provider (stub).
Enable by setting LDAP_URI and optional LDAP_* env vars.
Implement actual LDAP bind and search using python-ldap when needed.
"""
from .auth_providers import BaseAuthProvider


class LDAPAuthProvider(BaseAuthProvider):
    """
    LDAP auth provider. Configure via env:
    LDAP_URI, LDAP_BIND_DN, LDAP_BIND_PASSWORD,
    LDAP_USER_SEARCH_BASE, LDAP_GROUPS_BASE.
    """

    def __init__(self, ldap_uri, bind_dn=None, bind_password=None,
                 user_search_base=None, groups_base=None, **kwargs):
        self.ldap_uri = ldap_uri
        self.bind_dn = bind_dn or ""
        self.bind_password = bind_password or ""
        self.user_search_base = user_search_base or ""
        self.groups_base = groups_base or ""

    def authenticate(self, request, username=None, password=None, **kwargs):
        # TODO: implement LDAP bind and search; create or get Django User
        # if credentials are valid, return User; else return None
        return None

    def get_user(self, user_id):
        from django.contrib.auth import get_user_model
        User = get_user_model()
        try:
            return User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return None

    def get_user_groups(self, username=None, user=None):
        # TODO: implement LDAP group lookup.
        return []
