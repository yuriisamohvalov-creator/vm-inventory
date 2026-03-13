-- +goose Up
ALTER TABLE vm_auth_user
    ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;

-- +goose Down
ALTER TABLE vm_auth_user
    DROP COLUMN IF EXISTS must_change_password;
