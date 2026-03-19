"""
Import/export and search API for Swagger.
Bulk create/update from JSON; create missing tree nodes as needed.
"""
from django.db.models import Sum, Q
from rest_framework import status
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.response import Response
from rest_framework.views import APIView
from .permissions import RoleBasedAccessPermission

from .models import Department, Stream, InfoSystem, VM, Pool, PoolVM
from .serializers import (
    DepartmentSerializer, StreamSerializer, InfoSystemSerializer,
    VMSerializer, PoolSerializer, PoolDetailSerializer,
)


def _norm_tag(t):
    return (t or '').strip().upper().replace(' ', '_')


def _get_or_create_department(name, short_name=None, cpu_quota=None, ram_quota=None, disk_quota=None):
    defaults = {'short_name': (short_name or '').strip()}
    if cpu_quota is not None:
        defaults['cpu_quota'] = int(cpu_quota) if cpu_quota else 0
    if ram_quota is not None:
        defaults['ram_quota'] = int(ram_quota) if ram_quota else 0
    if disk_quota is not None:
        defaults['disk_quota'] = int(disk_quota) if disk_quota else 0
    dept, created = Department.objects.get_or_create(
        name=name.strip(),
        defaults=defaults,
    )
    # Обновить квоты, если они указаны и департамент уже существовал
    if not created:
        updated = False
        if cpu_quota is not None:
            dept.cpu_quota = int(cpu_quota) if cpu_quota else 0
            updated = True
        if ram_quota is not None:
            dept.ram_quota = int(ram_quota) if ram_quota else 0
            updated = True
        if disk_quota is not None:
            dept.disk_quota = int(disk_quota) if disk_quota else 0
            updated = True
        if updated:
            dept.save()
    return dept


def _get_or_create_stream(name, department):
    stream, _ = Stream.objects.get_or_create(
        name=name.strip(),
        department=department,
        defaults={},
    )
    return stream


def _get_or_create_infosystem(name, stream, code=None, is_id=None):
    isys, _ = InfoSystem.objects.get_or_create(
        name=name.strip(),
        stream=stream,
        defaults={
            'code': (code or '').strip(),
            'is_id': (is_id or '').strip(),
        },
    )
    if code is not None or is_id is not None:
        updated = False
        if code is not None and isys.code != (code or '').strip():
            isys.code = (code or '').strip()
            updated = True
        if is_id is not None and isys.is_id != (is_id or '').strip():
            isys.is_id = (is_id or '').strip()
            updated = True
        if updated:
            isys.save()
    return isys


def _resolve_infosystem(item):
    """Resolve InfoSystem from item: info_system_id, or info_system: {name, code?, stream_id?}, or stream_id + name, or dept/stream/is tree."""
    is_id = item.get('info_system_id')
    if is_id:
        try:
            return InfoSystem.objects.get(pk=is_id)
        except InfoSystem.DoesNotExist:
            pass
    is_data = item.get('info_system')
    if is_data:
        stream = None
        stream_id = is_data.get('stream_id')
        if stream_id:
            try:
                stream = Stream.objects.get(pk=stream_id)
            except Stream.DoesNotExist:
                pass
        if not stream and is_data.get('stream'):
            sd = is_data.get('stream')
            dept = None
            if sd.get('department_id'):
                try:
                    dept = Department.objects.get(pk=sd['department_id'])
                except Department.DoesNotExist:
                    pass
            if not dept and sd.get('department'):
                dd = sd.get('department')
                dept = _get_or_create_department(dd.get('name', ''), dd.get('short_name'))
            if dept:
                stream = _get_or_create_stream(sd.get('name', ''), dept)
            elif sd.get('name'):
                stream = Stream.objects.filter(name=sd['name']).first()
                if not stream:
                    return None
            if stream:
                return _get_or_create_infosystem(
                    is_data.get('name', ''),
                    stream,
                    code=is_data.get('code'),
                    is_id=is_data.get('is_id'),
                )
        elif stream:
            return _get_or_create_infosystem(
                is_data.get('name', ''),
                stream,
                code=is_data.get('code'),
                is_id=is_data.get('is_id'),
            )
    stream_id = item.get('stream_id')
    is_name = item.get('info_system_name')
    if stream_id and is_name:
        try:
            stream = Stream.objects.get(pk=stream_id)
            return _get_or_create_infosystem(is_name, stream, code=item.get('code'), is_id=item.get('is_id'))
        except Stream.DoesNotExist:
            pass
    return None


def _vm_tags_from_item(item, info_system):
    tags = item.get('tags')
    if isinstance(tags, list) and len(tags) >= 1:
        os_tag = _norm_tag(tags[0]) or 'LINUX'
        if os_tag not in ('LINUX', 'WINDOWS', 'MACOS'):
            os_tag = 'LINUX'
        is_code = (info_system.code or '').strip().upper().replace(' ', '_') if info_system else ''
        custom = [_norm_tag(t) for t in tags[2:] if _norm_tag(t)] if len(tags) > 2 else []
        return [os_tag, is_code] + custom
    os_tag = _norm_tag(item.get('os_tag')) or 'LINUX'
    if os_tag not in ('LINUX', 'WINDOWS', 'MACOS'):
        os_tag = 'LINUX'
    is_code = (info_system.code or '').strip().upper().replace(' ', '_') if info_system else ''
    return [os_tag, is_code]


class ImportDepartmentsView(APIView):
    """Импорт департаментов из JSON. Поддерживается вложенное дерево streams -> info_systems."""
    permission_classes = [RoleBasedAccessPermission]

    def post(self, request):
        data = request.data
        if isinstance(data, dict) and 'items' in data:
            data = data['items']
        if not isinstance(data, list):
            return Response({'error': 'Ожидается JSON-массив'}, status=status.HTTP_400_BAD_REQUEST)
        created, updated = [], []
        for item in data:
            name = (item.get('name') or '').strip()
            if not name:
                continue
            short_name = (item.get('short_name') or '').strip()
            cpu_quota = item.get('cpu_quota')
            ram_quota = item.get('ram_quota')
            disk_quota = item.get('disk_quota')
            dept = _get_or_create_department(
                name=name,
                short_name=short_name,
                cpu_quota=cpu_quota,
                ram_quota=ram_quota,
                disk_quota=disk_quota,
            )
            created_flag = dept.id not in (created + updated)
            (created if created_flag else updated).append(dept.id)
            for s in item.get('streams') or []:
                sname = (s.get('name') or '').strip()
                if not sname:
                    continue
                stream, _ = Stream.objects.get_or_create(name=sname, department=dept, defaults={})
                for is_item in s.get('info_systems') or []:
                    iname = (is_item.get('name') or '').strip()
                    if iname:
                        _get_or_create_infosystem(
                            iname, stream,
                            code=is_item.get('code'),
                            is_id=is_item.get('is_id'),
                        )
        return Response({'created': len(created), 'updated': len(updated), 'ids': created + updated})


class ImportStreamsView(APIView):
    """Импорт стримов из JSON. Можно передать department_id или вложенный department; вложенные info_systems создаются при отсутствии."""
    permission_classes = [RoleBasedAccessPermission]

    def post(self, request):
        data = request.data
        if isinstance(data, dict) and 'items' in data:
            data = data['items']
        if not isinstance(data, list):
            return Response({'error': 'Ожидается JSON-массив'}, status=status.HTTP_400_BAD_REQUEST)
        created, updated = [], []
        for item in data:
            name = (item.get('name') or '').strip()
            if not name:
                continue
            dept = None
            if item.get('department_id'):
                try:
                    dept = Department.objects.get(pk=item['department_id'])
                except Department.DoesNotExist:
                    pass
            if not dept and item.get('department'):
                dd = item['department']
                dept = _get_or_create_department(
                    dd.get('name', ''),
                    short_name=dd.get('short_name'),
                    cpu_quota=dd.get('cpu_quota'),
                    ram_quota=dd.get('ram_quota'),
                    disk_quota=dd.get('disk_quota'),
                )
            if not dept:
                return Response({'error': f'Департамент не найден для стрима: {name}'}, status=status.HTTP_400_BAD_REQUEST)
            stream, created_flag = Stream.objects.get_or_create(
                name=name, department=dept, defaults={},
            )
            (created if created_flag else updated).append(stream.id)
            for is_item in item.get('info_systems') or []:
                iname = (is_item.get('name') or '').strip()
                if iname:
                    _get_or_create_infosystem(
                        iname, stream,
                        code=is_item.get('code'),
                        is_id=is_item.get('is_id'),
                    )
        return Response({'created': len(created), 'updated': len(updated), 'ids': created + updated})


class ImportInfoSystemsView(APIView):
    """Импорт ИС из JSON. Можно передать stream_id или вложенный stream/department; при отсутствии создаются."""
    permission_classes = [RoleBasedAccessPermission]

    def post(self, request):
        data = request.data
        if isinstance(data, dict) and 'items' in data:
            data = data['items']
        if not isinstance(data, list):
            return Response({'error': 'Ожидается JSON-массив'}, status=status.HTTP_400_BAD_REQUEST)
        created, updated = [], []
        for item in data:
            name = (item.get('name') or '').strip()
            if not name:
                continue
            stream = None
            if item.get('stream_id'):
                try:
                    stream = Stream.objects.get(pk=item['stream_id'])
                except Stream.DoesNotExist:
                    pass
            if not stream and item.get('stream'):
                sd = item['stream']
                dept = None
                if sd.get('department_id'):
                    try:
                        dept = Department.objects.get(pk=sd['department_id'])
                    except Department.DoesNotExist:
                        pass
                if not dept and sd.get('department'):
                    dd = sd['department']
                    dept = _get_or_create_department(
                        dd.get('name', ''),
                        short_name=dd.get('short_name'),
                        cpu_quota=dd.get('cpu_quota'),
                        ram_quota=dd.get('ram_quota'),
                        disk_quota=dd.get('disk_quota'),
                    )
                if dept:
                    stream = _get_or_create_stream(sd.get('name', ''), dept)
            if not stream:
                return Response({'error': f'Стрим не найден для ИС: {name}'}, status=status.HTTP_400_BAD_REQUEST)
            isys, created_flag = InfoSystem.objects.get_or_create(
                name=name, stream=stream,
                defaults={'code': (item.get('code') or '').strip(), 'is_id': (item.get('is_id') or '').strip()},
            )
            if not created_flag:
                if item.get('code') is not None:
                    isys.code = (item.get('code') or '').strip()
                if item.get('is_id') is not None:
                    isys.is_id = (item.get('is_id') or '').strip()
                isys.save()
            (created if created_flag else updated).append(isys.id)
        return Response({'created': len(created), 'updated': len(updated), 'ids': created + updated})


class ImportVMsView(APIView):
    """Импорт ВМ из JSON. Можно передать info_system_id или вложенную иерархию info_system/stream/department; при отсутствии создаются."""
    permission_classes = [RoleBasedAccessPermission]

    def post(self, request):
        data = request.data
        if isinstance(data, dict) and 'items' in data:
            data = data['items']
        if not isinstance(data, list):
            return Response({'error': 'Ожидается JSON-массив'}, status=status.HTTP_400_BAD_REQUEST)
        created, updated = [], []
        for item in data:
            fqdn = (item.get('fqdn') or '').strip()
            if not fqdn:
                continue
            info_system = _resolve_infosystem(item)
            tags = _vm_tags_from_item(item, info_system)
            payload = {
                'fqdn': fqdn,
                'ip': (item.get('ip') or '000.000.000.000').strip(),
                'cpu': int(item.get('cpu') or 1),
                'ram': int(item.get('ram') or 1),
                'disk': int(item.get('disk') or 10),
                'instance': max(1, min(20, int(item.get('instance') or 1))),
                'tags': tags,
                'info_system': info_system,
            }
            vm, created_flag = VM.objects.update_or_create(
                fqdn=fqdn,
                defaults={
                    'ip': payload['ip'],
                    'cpu': payload['cpu'],
                    'ram': payload['ram'],
                    'disk': payload['disk'],
                    'instance': payload['instance'],
                    'tags': payload['tags'],
                    'info_system': payload['info_system'],
                    'is_active': True,
                    'deleted_at': None,
                },
            )
            (created if created_flag else updated).append(vm.id)
        return Response({'created': len(created), 'updated': len(updated), 'ids': created + updated})


class ImportPoolsView(APIView):
    """Импорт пулов из JSON. Передаётся массив объектов с name и опционально vm_fqdns (список FQDN ВМ для добавления в пул)."""
    permission_classes = [RoleBasedAccessPermission]

    def post(self, request):
        from django.utils import timezone
        data = request.data
        if isinstance(data, dict) and 'items' in data:
            data = data['items']
        if not isinstance(data, list):
            return Response({'error': 'Ожидается JSON-массив'}, status=status.HTTP_400_BAD_REQUEST)
        created, updated = [], []
        for item in data:
            name = (item.get('name') or '').strip()
            if not name:
                continue
            pool, created_flag = Pool.objects.get_or_create(name=name, defaults={})
            (created if created_flag else updated).append(pool.id)
            fqdns = item.get('vm_fqdns') or item.get('vms') or []
            instance_val = pool.instance_value()
            added_pvs = []
            for fqdn in fqdns:
                fqdn = (fqdn or '').strip()
                if not fqdn:
                    continue
                try:
                    vm = VM.objects.get(fqdn=fqdn, is_active=True)
                except VM.DoesNotExist:
                    continue
                if instance_val is not None and vm.instance != instance_val:
                    continue
                pv, pv_created = PoolVM.objects.get_or_create(pool=pool, vm=vm, defaults={})
                if not pv_created and pv.removed_at:
                    pv.removed_at = None
                    # Если ВМ была удалена и снова добавлена, восстанавливаем оригинальные теги из сохраненных
                    if pv.original_tags:
                        vm.tags = list(pv.original_tags)
                        vm.save(update_fields=['tags'])
                    pv.save()
                added_pvs.append((pv, pv_created))
            # Сохранить оригинальные теги для всех новых ВМ перед синхронизацией
            for pv, pv_created in added_pvs:
                if not pv.original_tags:
                    pv.original_tags = list(pv.vm.tags or [])
                    pv.save(update_fields=['original_tags'])
            # Синхронизировать теги всех ВМ в пуле после добавления всех ВМ
            from .views import sync_pool_tags
            sync_pool_tags(pool)
        return Response({'created': len(created), 'updated': len(updated), 'ids': created + updated})


def _as_list(value):
    return value if isinstance(value, list) else []


def _result_block(items_created, items_updated, errors):
    return {
        'created': len(items_created),
        'updated': len(items_updated),
        'ids': items_created + items_updated,
        'errors': errors,
    }


class ImportBulkFromFileView(APIView):
    """
    Массовый импорт из "единого" JSON файла:
    departments -> streams -> info_systems -> vms.

    Под капотом используется та же логика создания/обновления, что и у эндпоинтов /v1/*/import.
    """

    permission_classes = [RoleBasedAccessPermission]

    def post(self, request):
        from django.core.files.uploadedfile import UploadedFile
        import json

        uploaded = request.FILES.get('file')
        if not uploaded:
            return Response({'error': 'Файл импорта обязателен (multipart/form-data, поле "file")'},
                            status=status.HTTP_400_BAD_REQUEST)
        if not isinstance(uploaded, UploadedFile):
            return Response({'error': 'Поле "file" должно быть файлом'},
                            status=status.HTTP_400_BAD_REQUEST)

        try:
            raw = uploaded.read().decode('utf-8')
            data = json.loads(raw)
        except Exception:
            return Response({'error': 'Некорректный JSON в файле импорта'},
                            status=status.HTTP_400_BAD_REQUEST)

        if not isinstance(data, dict):
            return Response({'error': 'Ожидается JSON-объект верхнего уровня'},
                            status=status.HTTP_400_BAD_REQUEST)

        overall_errors = []
        def _get_optional_list(key):
            if key not in data or data.get(key) is None:
                return []
            if isinstance(data.get(key), list):
                return data.get(key) or []
            overall_errors.append({'key': key, 'error': 'Ожидается массив (JSON list)'})
            return []

        departments = _get_optional_list('departments')
        streams = _get_optional_list('streams')
        info_systems = _get_optional_list('info_systems')
        vms = _get_optional_list('vms')

        # 1) Departments (создаём дерево Department -> Stream -> InfoSystem при отсутствии)
        dept_created, dept_updated = [], []
        dept_errors = []
        for idx, item in enumerate(departments):
            try:
                name = (item.get('name') or '').strip()
                if not name:
                    dept_errors.append({'index': idx, 'error': 'Поле name обязательно'})
                    continue

                short_name = (item.get('short_name') or '').strip()
                cpu_quota = item.get('cpu_quota', None)
                ram_quota = item.get('ram_quota', None)
                disk_quota = item.get('disk_quota', None)

                dept = _get_or_create_department(
                    name=name,
                    short_name=short_name,
                    cpu_quota=cpu_quota,
                    ram_quota=ram_quota,
                    disk_quota=disk_quota,
                )

                created_flag = dept.id not in (dept_created + dept_updated)
                (dept_created if created_flag else dept_updated).append(dept.id)

                for s in item.get('streams') or []:
                    sname = (s.get('name') or '').strip()
                    if not sname:
                        continue
                    stream, _ = Stream.objects.get_or_create(name=sname, department=dept, defaults={})
                    for is_item in s.get('info_systems') or []:
                        iname = (is_item.get('name') or '').strip()
                        if not iname:
                            continue
                        _get_or_create_infosystem(
                            iname, stream,
                            code=is_item.get('code'),
                            is_id=is_item.get('is_id'),
                        )
            except Exception as e:
                dept_errors.append({'index': idx, 'error': str(e)})

        overall_errors.extend(dept_errors)

        # 2) Streams (опционально, если не передавать через departments.streams)
        stream_created, stream_updated = [], []
        stream_errors = []
        for idx, item in enumerate(streams):
            try:
                name = (item.get('name') or '').strip()
                if not name:
                    stream_errors.append({'index': idx, 'error': 'Поле name обязательно'})
                    continue

                dept = None
                if item.get('department_id'):
                    try:
                        dept = Department.objects.get(pk=item['department_id'])
                    except Department.DoesNotExist:
                        dept = None

                if not dept and item.get('department'):
                    dd = item['department']
                    dept = _get_or_create_department(
                        dd.get('name', ''),
                        short_name=dd.get('short_name'),
                        cpu_quota=dd.get('cpu_quota'),
                        ram_quota=dd.get('ram_quota'),
                        disk_quota=dd.get('disk_quota'),
                    )

                if not dept:
                    stream_errors.append({'index': idx, 'error': 'Департамент не найден для стрима'})
                    continue

                stream, created_flag = Stream.objects.get_or_create(
                    name=name, department=dept, defaults={},
                )
                (stream_created if created_flag else stream_updated).append(stream.id)

                for is_item in item.get('info_systems') or []:
                    iname = (is_item.get('name') or '').strip()
                    if not iname:
                        continue
                    _get_or_create_infosystem(
                        iname, stream,
                        code=is_item.get('code'),
                        is_id=is_item.get('is_id'),
                    )
            except Exception as e:
                stream_errors.append({'index': idx, 'error': str(e)})

        overall_errors.extend(stream_errors)

        # 3) InfoSystems (опционально, если не передавать через tree выше)
        is_created, is_updated = [], []
        is_errors = []
        for idx, item in enumerate(info_systems):
            try:
                name = (item.get('name') or '').strip()
                if not name:
                    is_errors.append({'index': idx, 'error': 'Поле name обязательно'})
                    continue

                stream = None
                if item.get('stream_id'):
                    try:
                        stream = Stream.objects.get(pk=item['stream_id'])
                    except Stream.DoesNotExist:
                        stream = None

                if not stream and item.get('stream'):
                    sd = item['stream']
                    dept = None
                    if sd.get('department_id'):
                        try:
                            dept = Department.objects.get(pk=sd['department_id'])
                        except Department.DoesNotExist:
                            dept = None
                    if not dept and sd.get('department'):
                        dd = sd['department']
                        dept = _get_or_create_department(
                            dd.get('name', ''),
                            short_name=dd.get('short_name'),
                            cpu_quota=dd.get('cpu_quota'),
                            ram_quota=dd.get('ram_quota'),
                            disk_quota=dd.get('disk_quota'),
                        )
                    if dept:
                        stream = _get_or_create_stream(sd.get('name', ''), dept)

                if not stream:
                    is_errors.append({'index': idx, 'error': 'Стрим не найден для ИС'})
                    continue

                isys, created_flag = InfoSystem.objects.get_or_create(
                    name=name,
                    stream=stream,
                    defaults={'code': (item.get('code') or '').strip(), 'is_id': (item.get('is_id') or '').strip()},
                )
                if not created_flag:
                    if item.get('code') is not None:
                        isys.code = (item.get('code') or '').strip()
                    if item.get('is_id') is not None:
                        isys.is_id = (item.get('is_id') or '').strip()
                    isys.save()

                (is_created if created_flag else is_updated).append(isys.id)
            except Exception as e:
                is_errors.append({'index': idx, 'error': str(e)})

        overall_errors.extend(is_errors)

        # 4) VMs
        vm_created, vm_updated = [], []
        vm_errors = []
        for idx, item in enumerate(vms):
            try:
                fqdn = (item.get('fqdn') or '').strip()
                if not fqdn:
                    vm_errors.append({'index': idx, 'error': 'Поле fqdn обязательно'})
                    continue

                info_system = _resolve_infosystem(item)
                tags = _vm_tags_from_item(item, info_system)

                cpu = int(item.get('cpu') or 1)
                ram = int(item.get('ram') or 1)
                disk = int(item.get('disk') or 10)
                instance = max(1, min(20, int(item.get('instance') or 1)))

                payload = {
                    'fqdn': fqdn,
                    'ip': (item.get('ip') or '000.000.000.000').strip(),
                    'cpu': cpu,
                    'ram': ram,
                    'disk': disk,
                    'instance': instance,
                    'tags': tags,
                    'info_system': info_system,
                }

                vm, created_flag = VM.objects.update_or_create(
                    fqdn=fqdn,
                    defaults={
                        'ip': payload['ip'],
                        'cpu': payload['cpu'],
                        'ram': payload['ram'],
                        'disk': payload['disk'],
                        'instance': payload['instance'],
                        'tags': payload['tags'],
                        'info_system': payload['info_system'],
                        'is_active': True,
                        'deleted_at': None,
                    },
                )
                (vm_created if created_flag else vm_updated).append(vm.id)
            except Exception as e:
                vm_errors.append({'index': idx, 'error': str(e)})

        overall_errors.extend(vm_errors)

        result = {
            'departments': _result_block(dept_created, dept_updated, dept_errors),
            'streams': _result_block(stream_created, stream_updated, stream_errors),
            'info_systems': _result_block(is_created, is_updated, is_errors),
            'vms': _result_block(vm_created, vm_updated, vm_errors),
        }
        # Ошибки верхнего уровня (например, некорректный тип ключа) + ошибки из всех секций.
        result['errors'] = overall_errors
        result['totals'] = {
            'created': sum(x['created'] for x in result.values() if isinstance(x, dict) and 'created' in x),
            'updated': sum(x['updated'] for x in result.values() if isinstance(x, dict) and 'updated' in x),
        }

        return Response(result, status=status.HTTP_207_MULTI_STATUS if overall_errors else status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([RoleBasedAccessPermission])
def search(request):
    """Поиск по всем разделам или конкретному разделу: департаменты, стримы, ИС, ВМ, пулы.
    
    Параметры:
    - q: поисковый запрос (обязательный)
    - section: раздел для поиска (опционально): 'departments', 'streams', 'infosystems', 'vms', 'pools'
    """
    q = (request.query_params.get('q') or '').strip()
    section = (request.query_params.get('section') or '').strip().lower()
    
    if not q or len(q) < 1:
        return Response({
            'departments': [],
            'streams': [],
            'info_systems': [],
            'vms': [],
            'pools': [],
        })
    
    result = {}
    
    # Поиск в департаментах
    if not section or section == 'departments':
        depts = Department.objects.filter(
            Q(name__icontains=q) | Q(short_name__icontains=q)
        )[:50]
        result['departments'] = DepartmentSerializer(depts, many=True).data
    else:
        result['departments'] = []
    
    # Поиск в стримах
    if not section or section == 'streams':
        streams = Stream.objects.filter(name__icontains=q).select_related('department')[:50]
        result['streams'] = StreamSerializer(streams, many=True).data
    else:
        result['streams'] = []
    
    # Поиск в ИС
    if not section or section == 'infosystems':
        isys = InfoSystem.objects.filter(
            Q(name__icontains=q) | Q(code__icontains=q) | Q(is_id__icontains=q)
        ).select_related('stream', 'stream__department')[:50]
        result['info_systems'] = InfoSystemSerializer(isys, many=True).data
    else:
        result['info_systems'] = []
    
    # Поиск в ВМ
    if not section or section == 'vms':
        vms = VM.objects.filter(
            Q(fqdn__icontains=q) | Q(ip__icontains=q),
            is_active=True,
        ).select_related('info_system')[:50]
        # Также поиск по тегам
        if not vms.exists():
            # Поиск по тегам через JSONField
            vms = VM.objects.filter(tags__icontains=q, is_active=True).select_related('info_system')[:50]
        result['vms'] = VMSerializer(vms, many=True).data
    else:
        result['vms'] = []
    
    # Поиск в пулах
    if not section or section == 'pools':
        pools = Pool.objects.filter(name__icontains=q)[:50]
        result['pools'] = PoolSerializer(pools, many=True).data
    else:
        result['pools'] = []
    
    return Response(result)


def report_json_response():
    """Собрать отчёт и вернуть HttpResponse с JSON и заголовком для скачивания."""
    from django.http import HttpResponse
    from django.db.models import Sum
    departments = Department.objects.prefetch_related(
        'streams__info_systems__vms'
    ).all()
    result = []
    for dept in departments:
        dept_vm_count = 0
        dept_sum_cpu = 0
        dept_sum_ram = 0
        dept_sum_disk = 0
        # Проверка превышения квот
        dept_has_exceeded = False
        dept_data = {
            'id': dept.id,
            'name': dept.name,
            'short_name': dept.short_name or '',
            'cpu_quota': dept.cpu_quota,
            'ram_quota': dept.ram_quota,
            'disk_quota': dept.disk_quota,
            'streams': []
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
                vms_qs = isys.vms.filter(is_active=True)
                vms_list = []
                for vm in vms_qs:
                    vms_list.append({
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
                        'info_system_deleted': vm.info_system is None,
                    })
                aggr = vms_qs.aggregate(sum_cpu=Sum('cpu'), sum_ram=Sum('ram'), sum_disk=Sum('disk'))
                is_vm_count = len(vms_list)
                is_sum_cpu = aggr['sum_cpu'] or 0
                is_sum_ram = aggr['sum_ram'] or 0
                is_sum_disk = aggr['sum_disk'] or 0
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
        # Проверка превышения квот
        if dept.cpu_quota > 0 and dept_sum_cpu > dept.cpu_quota:
            dept_has_exceeded = True
        if dept.ram_quota > 0 and dept_sum_ram > dept.ram_quota:
            dept_has_exceeded = True
        if dept.disk_quota > 0 and dept_sum_disk > dept.disk_quota:
            dept_has_exceeded = True
        dept_data['has_exceeded'] = dept_has_exceeded
        result.append(dept_data)
    orphan_vms = VM.objects.filter(info_system__isnull=True, is_active=True)
    if orphan_vms.exists():
        orphan_list = []
        for vm in orphan_vms:
            orphan_list.append({
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
                'info_system_deleted': True,  # ВМ без ИС считаются как с удаленной ИС
            })
        aggr = orphan_vms.aggregate(sum_cpu=Sum('cpu'), sum_ram=Sum('ram'), sum_disk=Sum('disk'))
        result.append({
            'id': None,
            'name': '(ВМ без ИС / удалённая ИС)',
            'short_name': '',
            'vm_count': len(orphan_list),
            'sum_cpu': aggr['sum_cpu'] or 0,
            'sum_ram': aggr['sum_ram'] or 0,
            'sum_disk': aggr['sum_disk'] or 0,
            'streams': [{
                'id': None,
                'name': '—',
                'cpu_quota': 0,
                'ram_quota': 0,
                'disk_quota': 0,
                'has_exceeded': False,
                'vm_count': len(orphan_list),
                'sum_cpu': aggr['sum_cpu'] or 0,
                'sum_ram': aggr['sum_ram'] or 0,
                'sum_disk': aggr['sum_disk'] or 0,
                'info_systems': [{
                    'id': None,
                    'name': '—',
                    'code': '',
                    'is_id': '',
                    'vms': orphan_list,
                    'vm_count': len(orphan_list),
                    'sum_cpu': aggr['sum_cpu'] or 0,
                    'sum_ram': aggr['sum_ram'] or 0,
                    'sum_disk': aggr['sum_disk'] or 0,
                }],
            }],
        })
    import json
    response = HttpResponse(json.dumps(result, ensure_ascii=False, indent=2), content_type='application/json; charset=utf-8')
    response['Content-Disposition'] = 'attachment; filename="vm-inventory-report.json"'
    return response
