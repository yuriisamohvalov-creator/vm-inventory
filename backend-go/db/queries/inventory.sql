-- name: ListDepartments :many
SELECT id, name, short_name, cpu_quota, ram_quota, disk_quota
FROM inventory_department
ORDER BY name;

-- name: GetDepartment :one
SELECT id, name, short_name, cpu_quota, ram_quota, disk_quota
FROM inventory_department
WHERE id = $1;

-- name: ListStreams :many
SELECT id, name, department_id, cpu_quota, ram_quota, disk_quota
FROM inventory_stream
ORDER BY name;

-- name: GetStream :one
SELECT id, name, department_id, cpu_quota, ram_quota, disk_quota
FROM inventory_stream
WHERE id = $1;

-- name: ListInfoSystems :many
SELECT id, name, code, is_id, stream_id
FROM inventory_infosystem
ORDER BY name;

-- name: GetInfoSystem :one
SELECT id, name, code, is_id, stream_id
FROM inventory_infosystem
WHERE id = $1;

-- name: ListVMs :many
SELECT id, fqdn, ip, cpu, ram, disk, instance, tags, info_system_id,
       ba_pfm_zak, ba_pfm_isp, ba_programma_byudzheta, ba_finansovaya_pozitsiya, ba_mir_kod
FROM inventory_vm
ORDER BY instance, fqdn;

-- name: GetVM :one
SELECT id, fqdn, ip, cpu, ram, disk, instance, tags, info_system_id,
       ba_pfm_zak, ba_pfm_isp, ba_programma_byudzheta, ba_finansovaya_pozitsiya, ba_mir_kod
FROM inventory_vm
WHERE id = $1;
