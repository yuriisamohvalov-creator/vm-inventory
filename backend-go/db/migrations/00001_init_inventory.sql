-- +goose Up
CREATE TABLE IF NOT EXISTS inventory_department (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    short_name VARCHAR(255) NOT NULL DEFAULT '',
    cpu_quota INTEGER NOT NULL DEFAULT 0,
    ram_quota INTEGER NOT NULL DEFAULT 0,
    disk_quota INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS inventory_stream (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    department_id BIGINT NOT NULL REFERENCES inventory_department(id) ON DELETE CASCADE,
    cpu_quota INTEGER NOT NULL DEFAULT 0,
    ram_quota INTEGER NOT NULL DEFAULT 0,
    disk_quota INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS inventory_infosystem (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(255) NOT NULL DEFAULT '',
    is_id VARCHAR(255) NOT NULL DEFAULT '',
    stream_id BIGINT NOT NULL REFERENCES inventory_stream(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS inventory_vm (
    id BIGSERIAL PRIMARY KEY,
    fqdn VARCHAR(255) NOT NULL UNIQUE,
    ip VARCHAR(15) NOT NULL DEFAULT '000.000.000.000',
    cpu INTEGER NOT NULL DEFAULT 1,
    ram INTEGER NOT NULL DEFAULT 1,
    disk INTEGER NOT NULL DEFAULT 10,
    instance SMALLINT NOT NULL DEFAULT 1,
    tags JSONB NOT NULL DEFAULT '[]'::jsonb,
    info_system_id BIGINT NULL REFERENCES inventory_infosystem(id) ON DELETE SET NULL,
    ba_pfm_zak VARCHAR(255) NOT NULL DEFAULT 'Z000000',
    ba_pfm_isp VARCHAR(255) NOT NULL DEFAULT 'Z000000',
    ba_programma_byudzheta VARCHAR(255) NULL,
    ba_finansovaya_pozitsiya VARCHAR(255) NOT NULL DEFAULT '00.00.00.00',
    ba_mir_kod VARCHAR(255) NOT NULL DEFAULT 'ITI_000_0000',
    CONSTRAINT instance_1_20 CHECK (instance >= 1 AND instance <= 20)
);

CREATE TABLE IF NOT EXISTS inventory_pool (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory_poolvm (
    id BIGSERIAL PRIMARY KEY,
    pool_id BIGINT NOT NULL REFERENCES inventory_pool(id) ON DELETE CASCADE,
    vm_id BIGINT NOT NULL REFERENCES inventory_vm(id) ON DELETE CASCADE,
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    removed_at TIMESTAMPTZ NULL,
    original_tags JSONB NULL DEFAULT '[]'::jsonb,
    CONSTRAINT inventory_poolvm_pool_vm_uniq UNIQUE (pool_id, vm_id)
);

CREATE INDEX IF NOT EXISTS idx_inventory_stream_department_id ON inventory_stream(department_id);
CREATE INDEX IF NOT EXISTS idx_inventory_infosystem_stream_id ON inventory_infosystem(stream_id);
CREATE INDEX IF NOT EXISTS idx_inventory_vm_info_system_id ON inventory_vm(info_system_id);
CREATE INDEX IF NOT EXISTS idx_inventory_poolvm_pool_id ON inventory_poolvm(pool_id);
CREATE INDEX IF NOT EXISTS idx_inventory_poolvm_vm_id ON inventory_poolvm(vm_id);

-- +goose Down
DROP TABLE IF EXISTS inventory_poolvm;
DROP TABLE IF EXISTS inventory_pool;
DROP TABLE IF EXISTS inventory_vm;
DROP TABLE IF EXISTS inventory_infosystem;
DROP TABLE IF EXISTS inventory_stream;
DROP TABLE IF EXISTS inventory_department;
