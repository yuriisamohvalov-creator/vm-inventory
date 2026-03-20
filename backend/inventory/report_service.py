from .models import Department, VM


def _vm_payload(vm, info_system_deleted=False):
    return {
        'fqdn': vm.fqdn,
        'ip': vm.ip,
        'cpu': vm.cpu,
        'ram': vm.ram,
        'disk': vm.disk,
        'ba_pfm_zak': vm.ba_pfm_zak,
        'ba_pfm_isp': vm.ba_pfm_isp,
        'ba_programma_byudzheta': vm.ba_programma_byudzheta,
        'ba_finansovaya_pozitsiya': vm.ba_finansovaya_pozitsiya,
        'ba_mir_kod': vm.ba_mir_kod,
        'info_system_deleted': info_system_deleted,
    }


def build_report_tree():
    departments = Department.objects.prefetch_related(
        'streams__info_systems__vms'
    ).all()
    result = []
    for dept in departments:
        dept_vm_count = 0
        dept_sum_cpu = 0
        dept_sum_ram = 0
        dept_sum_disk = 0
        dept_data = {
            'id': dept.id,
            'name': dept.name,
            'short_name': dept.short_name or '',
            'cpu_quota': dept.cpu_quota,
            'ram_quota': dept.ram_quota,
            'disk_quota': dept.disk_quota,
            'streams': [],
        }
        for stream in dept.streams.all():
            stream_vm_count = 0
            stream_sum_cpu = 0
            stream_sum_ram = 0
            stream_sum_disk = 0
            stream_data = {
                'id': stream.id,
                'name': stream.name,
                'cpu_quota': stream.cpu_quota,
                'ram_quota': stream.ram_quota,
                'disk_quota': stream.disk_quota,
                'info_systems': [],
            }
            for isys in stream.info_systems.all():
                active_vms = [vm for vm in isys.vms.all() if vm.is_active]
                vms_list = [_vm_payload(vm, info_system_deleted=vm.info_system is None) for vm in active_vms]
                is_vm_count = len(active_vms)
                is_sum_cpu = sum(vm.cpu for vm in active_vms)
                is_sum_ram = sum(vm.ram for vm in active_vms)
                is_sum_disk = sum(vm.disk for vm in active_vms)
                stream_data['info_systems'].append({
                    'id': isys.id,
                    'name': isys.name,
                    'code': isys.code or '',
                    'is_id': isys.is_id or '',
                    'vms': vms_list,
                    'vm_count': is_vm_count,
                    'sum_cpu': is_sum_cpu,
                    'sum_ram': is_sum_ram,
                    'sum_disk': is_sum_disk,
                })
                stream_vm_count += is_vm_count
                stream_sum_cpu += is_sum_cpu
                stream_sum_ram += is_sum_ram
                stream_sum_disk += is_sum_disk
            stream_data['vm_count'] = stream_vm_count
            stream_data['sum_cpu'] = stream_sum_cpu
            stream_data['sum_ram'] = stream_sum_ram
            stream_data['sum_disk'] = stream_sum_disk
            stream_data['has_exceeded'] = (
                (stream.cpu_quota > 0 and stream_sum_cpu > stream.cpu_quota)
                or (stream.ram_quota > 0 and stream_sum_ram > stream.ram_quota)
                or (stream.disk_quota > 0 and stream_sum_disk > stream.disk_quota)
            )
            dept_data['streams'].append(stream_data)
            dept_vm_count += stream_vm_count
            dept_sum_cpu += stream_sum_cpu
            dept_sum_ram += stream_sum_ram
            dept_sum_disk += stream_sum_disk
        dept_data['vm_count'] = dept_vm_count
        dept_data['sum_cpu'] = dept_sum_cpu
        dept_data['sum_ram'] = dept_sum_ram
        dept_data['sum_disk'] = dept_sum_disk
        dept_data['has_exceeded'] = (
            (dept.cpu_quota > 0 and dept_sum_cpu > dept.cpu_quota)
            or (dept.ram_quota > 0 and dept_sum_ram > dept.ram_quota)
            or (dept.disk_quota > 0 and dept_sum_disk > dept.disk_quota)
        )
        result.append(dept_data)

    orphan_vms = VM.objects.filter(info_system__isnull=True, is_active=True)
    if orphan_vms.exists():
        orphan_list = [_vm_payload(vm, info_system_deleted=True) for vm in orphan_vms]
        sum_cpu = sum(vm.cpu for vm in orphan_vms)
        sum_ram = sum(vm.ram for vm in orphan_vms)
        sum_disk = sum(vm.disk for vm in orphan_vms)
        result.append({
            'id': None,
            'name': '(ВМ без ИС / удалённая ИС)',
            'short_name': '',
            'vm_count': len(orphan_list),
            'sum_cpu': sum_cpu,
            'sum_ram': sum_ram,
            'sum_disk': sum_disk,
            'streams': [{
                'id': None,
                'name': '—',
                'cpu_quota': 0,
                'ram_quota': 0,
                'disk_quota': 0,
                'has_exceeded': False,
                'vm_count': len(orphan_list),
                'sum_cpu': sum_cpu,
                'sum_ram': sum_ram,
                'sum_disk': sum_disk,
                'info_systems': [{
                    'id': None,
                    'name': '—',
                    'code': '',
                    'is_id': '',
                    'vms': orphan_list,
                    'vm_count': len(orphan_list),
                    'sum_cpu': sum_cpu,
                    'sum_ram': sum_ram,
                    'sum_disk': sum_disk,
                }],
            }],
        })
    return result
