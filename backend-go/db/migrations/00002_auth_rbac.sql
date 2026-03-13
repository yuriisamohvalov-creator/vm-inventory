-- +goose Up
CREATE TABLE IF NOT EXISTS vm_auth_user (
    id BIGSERIAL PRIMARY KEY,
    username VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(32) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    auth_source VARCHAR(32) NOT NULL DEFAULT 'local',
    ldap_groups JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT vm_auth_user_role_chk CHECK (role IN ('admin', 'analyst'))
);

CREATE TABLE IF NOT EXISTS vm_auth_session_token (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES vm_auth_user(id) ON DELETE CASCADE,
    token_hash VARCHAR(128) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vm_auth_ldap_group_role_map (
    id BIGSERIAL PRIMARY KEY,
    ldap_group_dn VARCHAR(512) NOT NULL UNIQUE,
    role VARCHAR(32) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT vm_auth_ldap_group_role_map_role_chk CHECK (role IN ('admin', 'analyst'))
);

CREATE INDEX IF NOT EXISTS idx_vm_auth_session_token_user_id ON vm_auth_session_token(user_id);
CREATE INDEX IF NOT EXISTS idx_vm_auth_session_token_expires_at ON vm_auth_session_token(expires_at);

-- +goose Down
DROP TABLE IF EXISTS vm_auth_ldap_group_role_map;
DROP TABLE IF EXISTS vm_auth_session_token;
DROP TABLE IF EXISTS vm_auth_user;
