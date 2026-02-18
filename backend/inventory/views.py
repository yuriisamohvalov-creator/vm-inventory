from django.http import FileResponse
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import Department, Stream, InfoSystem, VM, Pool, PoolVM
from .serializers import (
    DepartmentSerializer, StreamSerializer, InfoSystemSerializer,
    VMSerializer, PoolSerializer, PoolDetailSerializer, PoolVMSerializer,
)
from .report_pdf import build_report_pdf


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


class VMViewSet(viewsets.ModelViewSet):
    queryset = VM.objects.select_related('info_system', 'info_system__stream', 'info_system__stream__department').all()
    serializer_class = VMSerializer


def sync_pool_tags(pool):
    """
    Синхронизировать теги всех ВМ в пуле: собрать все уникальные теги
    из всех ВМ в пуле и обновить теги каждой ВМ этим объединённым набором.
    """
    pool_vms = PoolVM.objects.filter(pool=pool, removed_at__isnull=True).select_related('vm', 'vm__info_system')
    if not pool_vms.exists():
        return
    
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
        qs = VM.objects.all().order_by('instance', 'fqdn')
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
            vm = VM.objects.get(pk=vm_id)
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
            pv.save()
        # Синхронизировать теги всех ВМ в пуле
        sync_pool_tags(pool)
        return Response({'status': 'ok', 'pool_vm_id': pv.id})

    @action(detail=True, methods=['post'], url_path='remove-vm/(?P<vm_id>[^/.]+)')
    def remove_vm(self, request, pk=None, vm_id=None):
        from django.utils import timezone
        pool = self.get_object()
        pv = PoolVM.objects.filter(pool=pool, vm_id=vm_id, removed_at__isnull=True).first()
        if not pv:
            return Response({'error': 'ВМ не в пуле'}, status=status.HTTP_404_NOT_FOUND)
        pv.removed_at = timezone.now()
        pv.save()
        # Синхронизировать теги всех ВМ в пуле после удаления
        sync_pool_tags(pool)
        return Response({'status': 'ok'})


class ReportViewSet(viewsets.ViewSet):
    def list(self, request):
        """Hierarchical report: Department -> Stream -> InfoSystem -> VMs with sums."""
        from django.db.models import Sum
        departments = Department.objects.prefetch_related(
            'streams__info_systems__vms'
        ).all()
        result = []
        for dept in departments:
            dept_data = {'id': dept.id, 'name': dept.name, 'streams': []}
            for stream in dept.streams.all():
                stream_data = {'id': stream.id, 'name': stream.name, 'info_systems': []}
                for isys in stream.info_systems.all():
                    vms_qs = isys.vms.all()
                    vms = list(vms_qs.values_list('fqdn', flat=True))
                    aggr = vms_qs.aggregate(
                        sum_cpu=Sum('cpu'),
                        sum_ram=Sum('ram'),
                        sum_disk=Sum('disk'),
                    )
                    stream_data['info_systems'].append({
                        'id': isys.id,
                        'name': isys.name,
                        'vms': vms,
                        'vm_count': len(vms),
                        'sum_cpu': aggr['sum_cpu'] or 0,
                        'sum_ram': aggr['sum_ram'] or 0,
                        'sum_disk': aggr['sum_disk'] or 0,
                    })
                dept_data['streams'].append(stream_data)
            result.append(dept_data)
        # Orphan VMs (info_system deleted)
        orphan_vms = VM.objects.filter(info_system__isnull=True)
        if orphan_vms.exists():
            aggr = orphan_vms.aggregate(
                sum_cpu=Sum('cpu'),
                sum_ram=Sum('ram'),
                sum_disk=Sum('disk'),
            )
            result.append({
                'id': None,
                'name': '(ВМ без ИС / удалённая ИС)',
                'streams': [{
                    'id': None,
                    'name': '—',
                    'info_systems': [{
                        'id': None,
                        'name': '—',
                        'vms': list(orphan_vms.values_list('fqdn', flat=True)),
                        'vm_count': orphan_vms.count(),
                        'sum_cpu': aggr['sum_cpu'] or 0,
                        'sum_ram': aggr['sum_ram'] or 0,
                        'sum_disk': aggr['sum_disk'] or 0,
                    }],
                }],
            })
        return Response(result)

    @action(detail=False, methods=['get'], url_path='pdf')
    def pdf(self, request):
        """Export current report as PDF."""
        buf = build_report_pdf()
        return FileResponse(
            buf,
            as_attachment=True,
            filename='vm-inventory-report.pdf',
            content_type='application/pdf',
        )

    @action(detail=False, methods=['get'], url_path='export/json')
    def export_json(self, request):
        """Выгрузка отчёта в виде JSON файла."""
        from .import_export import report_json_response
        return report_json_response()
