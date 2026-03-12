package app

import "context"

func (a *App) getOrCreateDepartmentByName(ctx context.Context, name string) (int64, error) {
	var id int64
	err := a.DB.QueryRow(ctx, `SELECT id FROM inventory_department WHERE name=$1`, name).Scan(&id)
	if err == nil {
		return id, nil
	}
	err = a.DB.QueryRow(ctx, `
		INSERT INTO inventory_department (name, short_name, cpu_quota, ram_quota, disk_quota)
		VALUES ($1, '', 0, 0, 0)
		RETURNING id
	`, name).Scan(&id)
	return id, err
}

func (a *App) getOrCreateStreamByName(ctx context.Context, name string, departmentID int64) (int64, error) {
	var id int64
	err := a.DB.QueryRow(ctx, `SELECT id FROM inventory_stream WHERE name=$1 AND department_id=$2`, name, departmentID).Scan(&id)
	if err == nil {
		return id, nil
	}
	err = a.DB.QueryRow(ctx, `
		INSERT INTO inventory_stream (name, department_id, cpu_quota, ram_quota, disk_quota)
		VALUES ($1, $2, 0, 0, 0)
		RETURNING id
	`, name, departmentID).Scan(&id)
	return id, err
}

func (a *App) getOrCreateInfoSystem(ctx context.Context, name string, streamID int64, code string, isID string) (int64, error) {
	var id int64
	err := a.DB.QueryRow(ctx, `SELECT id FROM inventory_infosystem WHERE name=$1 AND stream_id=$2`, name, streamID).Scan(&id)
	if err == nil {
		_, err = a.DB.Exec(ctx, `UPDATE inventory_infosystem SET code=$2, is_id=$3 WHERE id=$1`, id, code, isID)
		return id, err
	}
	err = a.DB.QueryRow(ctx, `
		INSERT INTO inventory_infosystem (name, code, is_id, stream_id)
		VALUES ($1, $2, $3, $4)
		RETURNING id
	`, name, code, isID, streamID).Scan(&id)
	return id, err
}
