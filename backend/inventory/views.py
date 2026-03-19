from django.http import FileResponse
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Department, Stream, InfoSystem, VM, Pool, PoolVM
from .serializers import (
    DepartmentSerializer, StreamSerializer, InfoSystemSerializer,
    VMSerializer, PoolSerializer, PoolDetailSerializer, PoolVMSerializer,
)
from .report_pdf import build_report_pdf
from .report_xlsx import build_report_xlsx


class ReportExportPDFView(APIView):
    """Выгрузка отчёта только в PDF. Отдельный view для надёжного маршрута /api/report/export/."""
    requires_report_export_permission = True

    def get(self, request):
        buf = build_report_pdf()
        return FileResponse(
            buf,
            as_attachment=True,
            filename='vm-inventory-report.pdf',
            content_type='application/pdf',
        )


class DepartmentViewSet(viewsets.ModelViewSet):
    queryset = Department.objects.all()
    serializer_class = DepartmentSerializer


class StreamViewSet(viewsets.ModelViewSet):
    queryset = Stream.objects.select_related('department').all()
    serializer_class = StreamSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        department_id = self.request.query_params.get('department_id')
        if department_id:
            qs = qs.filter(department_id=department_id)
        return qs


class InfoSystemViewSet(viewsets.ModelViewSet):
    queryset = InfoSystem.objects.select_related('stream', 'stream__department').all()
    serializer_class = InfoSystemSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        stream_id = self.request.query_params.get('stream_id')
        if stream_id:
            qs = qs.filter(stream_id=stream_id)
        return qs

    def create(self, request, *args, **kwargs):
        """Поддержка массового создания и обработка stream_name/department_name."""
        data = request.data
        
        # Если передан массив, обрабатываем массовое создание
        if isinstance(data, list):
            return self._bulk_create(data)
        
        # Если передан объект с stream_name/department_name, обрабатываем их
        if isinstance(data, dict) and ('stream_name' in data or 'department_name' in data):
            data = self._resolve_stream_from_names(data.copy())
        
        return super().create(request, *args, **kwargs)

    def _resolve_stream_from_names(self, data):
        """Разрешить stream из stream_name и department_name."""
        from .import_export import _get_or_create_department, _get_or_create_stream
        
        stream_id = data.get('stream')
        stream_name = data.get('stream_name')
        department_name = data.get('department_name')
        
        # Если есть stream_id, проверяем его валидность и используем
        if stream_id:
            try:
                stream = Stream.objects.get(pk=stream_id)
                # Если также указаны stream_name и department_name, проверяем соответствие
                if stream_name and department_name:
                    if stream.name != stream_name.strip() or stream.department.name != department_name.strip():
                        # Несоответствие, но используем stream_id как приоритетный
                        pass
                data['stream'] = stream.id
                # Удаляем временные поля
                data.pop('stream_name', None)
                data.pop('department_name', None)
                return data
            except Stream.DoesNotExist:
                # stream_id не найден, пытаемся найти по именам
                pass
        
        # Если есть stream_name и department_name, создаем/находим их
        if stream_name and department_name:
            dept = _get_or_create_department(department_name.strip())
            stream = _get_or_create_stream(stream_name.strip(), dept)
            data['stream'] = stream.id
        
        # Удаляем временные поля
        data.pop('stream_name', None)
        data.pop('department_name', None)
        
        return data

    def _bulk_create(self, data_list):
        """Массовое создание ИС."""
        from rest_framework.response import Response
        from rest_framework import status
        from .import_export import _get_or_create_department, _get_or_create_stream
        
        created = []
        errors = []
        
        for idx, item in enumerate(data_list):
            try:
                # Разрешить stream из stream_name/department_name
                item = self._resolve_stream_from_names(item.copy())
                
                # Валидация обязательных полей
                name = (item.get('name') or '').strip()
                if not name:
                    errors.append({'index': idx, 'error': 'Поле name обязательно'})
                    continue
                
                stream_id = item.get('stream')
                if not stream_id:
                    errors.append({'index': idx, 'error': 'Поле stream обязательно'})
                    continue
                
                try:
                    stream = Stream.objects.get(pk=stream_id)
                except Stream.DoesNotExist:
                    errors.append({'index': idx, 'error': f'Стрим с ID {stream_id} не найден'})
                    continue
                
                # Создать или обновить ИС
                isys, created_flag = InfoSystem.objects.get_or_create(
                    name=name,
                    stream=stream,
                    defaults={
                        'code': (item.get('code') or '').strip(),
                        'is_id': (item.get('is_id') or '').strip(),
                    }
                )
                
                # Обновить, если уже существует
                if not created_flag:
                    if item.get('code') is not None:
                        isys.code = (item.get('code') or '').strip()
                    if item.get('is_id') is not None:
                        isys.is_id = (item.get('is_id') or '').strip()
                    isys.save()
                
                created.append({
                    'id': isys.id,
                    'name': isys.name,
                    'created': created_flag
                })
            except Exception as e:
                errors.append({'index': idx, 'error': str(e)})
        
        if errors:
            return Response({
                'created': len(created),
                'errors': errors,
                'items': created
            }, status=status.HTTP_207_MULTI_STATUS)
        
        return Response({
            'created': len(created),
            'items': created
        }, status=status.HTTP_201_CREATED)


class VMViewSet(viewsets.ModelViewSet):
    queryset = VM.objects.select_related('info_system', 'info_system__stream', 'info_system__stream__department').all()
    serializer_class = VMSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        include_deleted = (self.request.query_params.get('include_deleted') or '').lower() in ('1', 'true', 'yes')
        if include_deleted:
            return qs
        return qs.filter(is_active=True)

    def perform_destroy(self, instance):
        from django.utils import timezone
        if not instance.is_active:
            return
        instance.is_active = False
        instance.deleted_at = timezone.now()
        instance.save(update_fields=['is_active', 'deleted_at', 'updated_at'])

    @action(detail=True, methods=['post'])
    def restore(self, request, pk=None):
        vm = self.get_object()
        if vm.is_active:
            return Response({'status': 'ok', 'detail': 'VM уже активна'})
        vm.is_active = True
        vm.deleted_at = None
        vm.save(update_fields=['is_active', 'deleted_at', 'updated_at'])
        return Response({'status': 'ok'})


def sync_pool_tags(pool, added_pv=None):
    """
    Синхронизировать теги всех ВМ в пуле: собрать все уникальные теги
    из всех ВМ в пуле и обновить теги каждой ВМ этим объединённым набором.
    При первом добавлении ВМ сохраняем её оригинальные теги в original_tags.
    """
    pool_vms = PoolVM.objects.filter(pool=pool, removed_at__isnull=True).select_related('vm', 'vm__info_system')
    if not pool_vms.exists():
        return
    
    # Сохранить оригинальные теги для только что добавленной ВМ (если это первое добавление)
    if added_pv and not added_pv.original_tags:
        added_pv.original_tags = list(added_pv.vm.tags or [])
        added_pv.save(update_fields=['original_tags'])
    
    # Собрать все уникальные теги из всех ВМ в пуле
    all_tags_set = set()
    for pv in pool_vms:
        vm = pv.vm
        tags = vm.tags or []
        for tag in tags:
            if tag and isinstance(tag, str):
                tag_upper = tag.strip().upper()
                if tag_upper:
                    all_tags_set.add(tag_upper)
        
        # Также добавить код ИС как обязательный тег
        if vm.info_system and vm.info_system.code:
            is_code = (vm.info_system.code or '').strip().upper().replace(' ', '_')
            if is_code:
                all_tags_set.add(is_code)
    
    # Преобразовать в отсортированный список (ОС теги первыми, затем остальные)
    os_tags = ['LINUX', 'WINDOWS', 'MACOS']
    result_tags = []
    # Добавить ОС теги, которые есть в пуле
    for os_tag in os_tags:
        if os_tag in all_tags_set:
            result_tags.append(os_tag)
            all_tags_set.remove(os_tag)
    # Добавить остальные теги (коды ИС и кастомные) в алфавитном порядке
    result_tags.extend(sorted(all_tags_set))
    
    # Обновить теги каждой ВМ в пуле
    for pv in pool_vms:
        vm = pv.vm
        # Сохранить оригинальные теги при первом добавлении
        if not pv.original_tags:
            pv.original_tags = list(vm.tags or [])
            pv.save(update_fields=['original_tags'])
        vm.tags = result_tags.copy()
        vm.save(update_fields=['tags'])


class PoolViewSet(viewsets.ModelViewSet):
    queryset = Pool.objects.all()
    serializer_class = PoolSerializer

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return PoolDetailSerializer
        return PoolSerializer

    @action(detail=True, methods=['get'])
    def available_vms(self, request, pk=None):
        """VMs that can be added to this pool (same instance as pool or any if pool empty)."""
        pool = self.get_object()
        instance_val = pool.instance_value()
        qs = VM.objects.filter(is_active=True).order_by('instance', 'fqdn')
        if instance_val is not None:
            qs = qs.filter(instance=instance_val)
        in_pool_ids = set(
            PoolVM.objects.filter(pool=pool, removed_at__isnull=True).values_list('vm_id', flat=True)
        )
        qs = qs.exclude(id__in=in_pool_ids)
        serializer = VMSerializer(qs, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['post'], url_path='add-vm/(?P<vm_id>[^/.]+)')
    def add_vm(self, request, pk=None, vm_id=None):
        pool = self.get_object()
        try:
            vm = VM.objects.get(pk=vm_id, is_active=True)
        except VM.DoesNotExist:
            return Response({'error': 'VM не найдена'}, status=status.HTTP_404_NOT_FOUND)
        instance_val = pool.instance_value()
        if instance_val is not None and vm.instance != instance_val:
            return Response(
                {'error': f'В пул можно добавлять только ВМ с instance={instance_val}'},
                status=status.HTTP_400_BAD_REQUEST
            )
        pv, created = PoolVM.objects.get_or_create(pool=pool, vm=vm, defaults={})
        if not created and pv.removed_at:
            pv.removed_at = None
            # Если ВМ была удалена и снова добавлена, восстанавливаем оригинальные теги из сохраненных
            if pv.original_tags:
                vm.tags = list(pv.original_tags)
                vm.save(update_fields=['tags'])
            pv.save()
        # Синхронизировать теги всех ВМ в пуле (сохранит оригинальные теги для новой ВМ)
        sync_pool_tags(pool, added_pv=pv if created else None)
        return Response({'status': 'ok', 'pool_vm_id': pv.id})

    @action(detail=True, methods=['post'], url_path='remove-vm/(?P<vm_id>[^/.]+)')
    def remove_vm(self, request, pk=None, vm_id=None):
        from django.utils import timezone
        pool = self.get_object()
        pv = PoolVM.objects.filter(pool=pool, vm_id=vm_id, removed_at__isnull=True).first()
        if not pv:
            return Response({'error': 'ВМ не в пуле'}, status=status.HTTP_404_NOT_FOUND)
        
        vm = pv.vm
        removed_is_code = None
        if vm.info_system and vm.info_system.code:
            removed_is_code = (vm.info_system.code or '').strip().upper().replace(' ', '_')
        
        # Восстановить оригинальные теги ВМ
        if pv.original_tags:
            vm.tags = list(pv.original_tags)
        else:
            # Если оригинальные теги не сохранены, оставляем только первый тег (ОС) и второй (код ИС этой ВМ)
            current_tags = vm.tags or []
            if len(current_tags) >= 1:
                os_tag = current_tags[0]
                is_code = removed_is_code if removed_is_code else (current_tags[1] if len(current_tags) > 1 else '')
                vm.tags = [os_tag] + ([is_code] if is_code else [])
            else:
                vm.tags = ['LINUX']
        vm.save(update_fields=['tags'])
        
        pv.removed_at = timezone.now()
        pv.save()
        
        # Пересчитать теги пула (удалить тег ИС и кастомные теги удаленной ВМ, если больше нет ВМ с этими тегами)
        remaining_pool_vms = PoolVM.objects.filter(pool=pool, removed_at__isnull=True).select_related('vm', 'vm__info_system')
        if remaining_pool_vms.exists():
            # Получить кастомные теги удаленной ВМ (из original_tags, все кроме первого и второго тега)
            removed_custom_tags = set()
            if pv.original_tags and len(pv.original_tags) > 2:
                for tag in pv.original_tags[2:]:
                    if tag and isinstance(tag, str):
                        tag_upper = tag.strip().upper()
                        if tag_upper:
                            removed_custom_tags.add(tag_upper)
            
            # Собрать все уникальные теги из оставшихся ВМ
            all_tags_set = set()
            for remaining_pv in remaining_pool_vms:
                remaining_vm = remaining_pv.vm
                tags = remaining_vm.tags or []
                for tag in tags:
                    if tag and isinstance(tag, str):
                        tag_upper = tag.strip().upper()
                        if tag_upper:
                            all_tags_set.add(tag_upper)
                if remaining_vm.info_system and remaining_vm.info_system.code:
                    is_code = (remaining_vm.info_system.code or '').strip().upper().replace(' ', '_')
                    if is_code:
                        all_tags_set.add(is_code)
            
            # Проверить, есть ли еще ВМ с кодом ИС удаленной ВМ
            has_removed_is_code = False
            if removed_is_code:
                for remaining_pv in remaining_pool_vms:
                    remaining_vm = remaining_pv.vm
                    if remaining_vm.info_system and remaining_vm.info_system.code:
                        if (remaining_vm.info_system.code or '').strip().upper().replace(' ', '_') == removed_is_code:
                            has_removed_is_code = True
                            break
            
            # Если нет других ВМ с этим кодом ИС, удалить тег из пула
            if removed_is_code and not has_removed_is_code and removed_is_code in all_tags_set:
                all_tags_set.remove(removed_is_code)
            
            # Проверить кастомные теги удаленной ВМ
            # Для каждого кастомного тега проверить, есть ли он в original_tags других ВМ в пуле
            for custom_tag in removed_custom_tags:
                has_custom_tag_in_other_vms = False
                for remaining_pv in remaining_pool_vms:
                    remaining_original_tags = remaining_pv.original_tags or []
                    # Проверить, был ли этот кастомный тег в оригинальных тегах другой ВМ
                    if len(remaining_original_tags) > 2:
                        for orig_tag in remaining_original_tags[2:]:
                            if orig_tag and isinstance(orig_tag, str):
                                if orig_tag.strip().upper() == custom_tag:
                                    has_custom_tag_in_other_vms = True
                                    break
                    if has_custom_tag_in_other_vms:
                        break
                
                # Если кастомный тег не найден в original_tags других ВМ, удалить его из пула
                if not has_custom_tag_in_other_vms and custom_tag in all_tags_set:
                    all_tags_set.remove(custom_tag)
            
            # Преобразовать в отсортированный список
            os_tags = ['LINUX', 'WINDOWS', 'MACOS']
            result_tags = []
            for os_tag in os_tags:
                if os_tag in all_tags_set:
                    result_tags.append(os_tag)
                    all_tags_set.remove(os_tag)
            result_tags.extend(sorted(all_tags_set))
            
            # Обновить теги всех оставшихся ВМ в пуле
            for remaining_pv in remaining_pool_vms:
                remaining_vm = remaining_pv.vm
                remaining_vm.tags = result_tags.copy()
                remaining_vm.save(update_fields=['tags'])
        
        # Проверить, есть ли удаленная ВМ еще в других пулах
        other_pools_count = PoolVM.objects.filter(vm=vm, removed_at__isnull=True).exclude(pool=pool).count()
        if other_pools_count == 0:
            # Если ВМ больше не в пулах, очистить original_tags во всех записях PoolVM для этой ВМ
            PoolVM.objects.filter(vm=vm).update(original_tags=None)
        
        return Response({'status': 'ok'})


class ReportViewSet(viewsets.ViewSet):
    requires_report_export_permission = False

    def get_permissions(self):
        if getattr(self, 'action', None) in ('pdf', 'export_json', 'export_xlsx'):
            self.requires_report_export_permission = True
        else:
            self.requires_report_export_permission = False
        return super().get_permissions()

    def list(self, request):
        """Hierarchical report: Department -> Stream -> InfoSystem -> VMs with sums."""
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
                        # Проверка, удалена ли ИС
                        is_deleted = vm.info_system is None
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
                            'info_system_deleted': is_deleted,
                        })
                    aggr = vms_qs.aggregate(
                        sum_cpu=Sum('cpu'),
                        sum_ram=Sum('ram'),
                        sum_disk=Sum('disk'),
                    )
                    is_vm_count = len(vms_list)
                    is_sum_cpu = aggr['sum_cpu'] or 0
                    is_sum_ram = aggr['sum_ram'] or 0
                    is_sum_disk = aggr['sum_disk'] or 0
                    stream_data['info_systems'].append({
                        'id': isys.id,
                        'name': isys.name,
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
        # Orphan VMs (info_system deleted)
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
            aggr = orphan_vms.aggregate(
                sum_cpu=Sum('cpu'),
                sum_ram=Sum('ram'),
                sum_disk=Sum('disk'),
            )
            result.append({
                'id': None,
                'name': '(ВМ без ИС / удалённая ИС)',
                'vm_count': len(orphan_list),
                'sum_cpu': aggr['sum_cpu'] or 0,
                'sum_ram': aggr['sum_ram'] or 0,
                'sum_disk': aggr['sum_disk'] or 0,
                'streams': [{
                    'id': None,
                    'name': '—',
                    'vm_count': len(orphan_list),
                    'sum_cpu': aggr['sum_cpu'] or 0,
                    'sum_ram': aggr['sum_ram'] or 0,
                    'sum_disk': aggr['sum_disk'] or 0,
                    'info_systems': [{
                        'id': None,
                        'name': '—',
                        'vms': orphan_list,
                        'vm_count': len(orphan_list),
                        'sum_cpu': aggr['sum_cpu'] or 0,
                        'sum_ram': aggr['sum_ram'] or 0,
                        'sum_disk': aggr['sum_disk'] or 0,
                    }],
                }],
            })
        return Response(result)

    @action(detail=False, methods=['get'], url_path='pdf')
    def pdf(self, request):
        """Export current report as PDF (legacy endpoint)."""
        buf = build_report_pdf()
        return FileResponse(
            buf,
            as_attachment=True,
            filename='vm-inventory-report.pdf',
            content_type='application/pdf',
        )

    @action(detail=False, methods=['get'], url_path='export/json')
    def export_json(self, request):
        """Выгрузка отчёта в виде JSON файла (legacy endpoint)."""
        from .import_export import report_json_response
        return report_json_response()

    @action(detail=False, methods=['get'], url_path='export/xlsx')
    def export_xlsx(self, request):
        """Выгрузка отчёта в виде XLSX файла."""
        buf = build_report_xlsx()
        return FileResponse(
            buf,
            as_attachment=True,
            filename='vm-inventory-report.xlsx',
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )
