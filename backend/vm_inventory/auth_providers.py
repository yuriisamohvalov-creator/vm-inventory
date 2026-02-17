"""
Authentication provider abstraction.
By default no-auth is used. Can be switched to LDAP by setting LDAP_URI in config.
"""
from abc import ABC, abstractmethod


class BaseAuthProvider(ABC):
    """Abstract base for authentication providers (no-auth, LDAP, etc.)."""

    @abstractmethod
    def authenticate(self, request, username=None, password=None, **kwargs):
        """Return user object if authenticated, None otherwise."""
        pass

    @abstractmethod
    def get_user(self, user_id):
        """Return user by id if exists."""
        pass


class NoAuthProvider(BaseAuthProvider):
    """No authentication: all requests are treated as anonymous allowed."""

    def authenticate(self, request, username=None, password=None, **kwargs):
        return None  # No user required

    def get_user(self, user_id):
        return None


def get_auth_provider(ldap_uri=None, **ldap_config):
    """
    Factory: returns NoAuthProvider if LDAP is not configured,
    otherwise returns LDAPProvider (when implemented).
    Usage in settings:
        AUTH_PROVIDER = get_auth_provider(
            ldap_uri=os.environ.get('LDAP_URI'),
            ...
        )
    """
    if ldap_uri and ldap_uri.strip():
        try:
            from .auth_ldap import LDAPAuthProvider
            return LDAPAuthProvider(ldap_uri=ldap_uri, **ldap_config)
        except ImportError:
            pass
    return NoAuthProvider()
