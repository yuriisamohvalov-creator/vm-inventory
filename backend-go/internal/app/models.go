package app

import "time"

type Department struct {
	ID                   int64  `json:"id"`
	Name                 string `json:"name"`
	ShortName            string `json:"short_name"`
	CPUQuota             int    `json:"cpu_quota"`
	RAMQuota             int    `json:"ram_quota"`
	DiskQuota            int    `json:"disk_quota"`
	StreamsCPUQuotaSum   int    `json:"streams_cpu_quota_sum"`
	StreamsRAMQuotaSum   int    `json:"streams_ram_quota_sum"`
	StreamsDiskQuotaSum  int    `json:"streams_disk_quota_sum"`
	QuotaExceeded        bool   `json:"quota_exceeded"`
}

type Stream struct {
	ID             int64  `json:"id"`
	Name           string `json:"name"`
	Department     int64  `json:"department"`
	DepartmentName string `json:"department_name"`
	CPUQuota       int    `json:"cpu_quota"`
	RAMQuota       int    `json:"ram_quota"`
	DiskQuota      int    `json:"disk_quota"`
}

type InfoSystem struct {
	ID             int64  `json:"id"`
	Name           string `json:"name"`
	Code           string `json:"code"`
	IsID           string `json:"is_id"`
	Stream         int64  `json:"stream"`
	StreamName     string `json:"stream_name"`
	DepartmentName string `json:"department_name"`
}

type VM struct {
	ID                    int64    `json:"id"`
	FQDN                  string   `json:"fqdn"`
	IP                    string   `json:"ip"`
	CPU                   int      `json:"cpu"`
	RAM                   int      `json:"ram"`
	Disk                  int      `json:"disk"`
	Instance              int      `json:"instance"`
	Tags                  []string `json:"tags"`
	InfoSystem            *int64   `json:"info_system"`
	InfoSystemName        *string  `json:"info_system_name"`
	InfoSystemCode        string   `json:"info_system_code"`
	BAPFMZak              string   `json:"ba_pfm_zak"`
	BAPFMIsp              string   `json:"ba_pfm_isp"`
	BAProgrammaByudzheta  *string  `json:"ba_programma_byudzheta"`
	BAFinansovayaPozitsiya string  `json:"ba_finansovaya_pozitsiya"`
	BAMirKod              string   `json:"ba_mir_kod"`
}

type Pool struct {
	ID        int64     `json:"id"`
	Name      string    `json:"name"`
	CreatedAt time.Time `json:"created_at"`
	PoolTags  []string  `json:"pool_tags"`
}

type PoolDetail struct {
	ID          int64              `json:"id"`
	Name        string             `json:"name"`
	CreatedAt   time.Time          `json:"created_at"`
	VMsInPool   []PoolVMShort      `json:"vms_in_pool"`
	InstanceVal *int               `json:"instance_value"`
	PoolTags    []string           `json:"pool_tags"`
}

type PoolVMShort struct {
	ID       int64  `json:"id"`
	FQDN     string `json:"fqdn"`
	Instance int    `json:"instance"`
}

type ReportVM struct {
	FQDN                  string   `json:"fqdn"`
	IP                    string   `json:"ip"`
	CPU                   int      `json:"cpu"`
	RAM                   int      `json:"ram"`
	Disk                  int      `json:"disk"`
	BAPFMZak              string   `json:"ba_pfm_zak"`
	BAPFMIsp              string   `json:"ba_pfm_isp"`
	BAProgrammaByudzheta  *string  `json:"ba_programma_byudzheta"`
	BAFinansovayaPozitsiya string  `json:"ba_finansovaya_pozitsiya"`
	BAMirKod              string   `json:"ba_mir_kod"`
	InfoSystemDeleted     bool     `json:"info_system_deleted"`
}

type ReportInfoSystem struct {
	ID      *int64     `json:"id"`
	Name    string     `json:"name"`
	Code    string     `json:"code,omitempty"`
	IsID    string     `json:"is_id,omitempty"`
	VMs     []ReportVM `json:"vms"`
	VMCount int        `json:"vm_count"`
	SumCPU  int        `json:"sum_cpu"`
	SumRAM  int        `json:"sum_ram"`
	SumDisk int        `json:"sum_disk"`
}

type ReportStream struct {
	ID          *int64            `json:"id"`
	Name        string            `json:"name"`
	CPUQuota    int               `json:"cpu_quota"`
	RAMQuota    int               `json:"ram_quota"`
	DiskQuota   int               `json:"disk_quota"`
	HasExceeded bool              `json:"has_exceeded"`
	InfoSystems []ReportInfoSystem `json:"info_systems"`
	VMCount     int               `json:"vm_count"`
	SumCPU      int               `json:"sum_cpu"`
	SumRAM      int               `json:"sum_ram"`
	SumDisk     int               `json:"sum_disk"`
}

type ReportDepartment struct {
	ID          *int64        `json:"id"`
	Name        string        `json:"name"`
	ShortName   string        `json:"short_name,omitempty"`
	CPUQuota    int           `json:"cpu_quota"`
	RAMQuota    int           `json:"ram_quota"`
	DiskQuota   int           `json:"disk_quota"`
	HasExceeded bool          `json:"has_exceeded"`
	Streams     []ReportStream `json:"streams"`
	VMCount     int           `json:"vm_count"`
	SumCPU      int           `json:"sum_cpu"`
	SumRAM      int           `json:"sum_ram"`
	SumDisk     int           `json:"sum_disk"`
}
