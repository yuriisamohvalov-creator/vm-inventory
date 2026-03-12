-- +goose Up
ALTER TABLE auth_user
    ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;

-- +goose Down
ALTER TABLE auth_user
    DROP COLUMN IF EXISTS must_change_password;
