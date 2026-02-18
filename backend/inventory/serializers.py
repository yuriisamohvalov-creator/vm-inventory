from rest_framework import serializers
from .models import Department, Stream, InfoSystem, VM

class VMReportSerializer(serializers.ModelSerializer):
    class Meta:
        model = VM
        fields = ['fqdn', 'ip', 'cpu', 'ram', 'disk', 'tags', 'instance']

class InfoSystemReportSerializer(serializers.ModelSerializer):
    vms = VMReportSerializer(source='vm_set', many=True, read_only=True)
    vm_count = serializers.IntegerField(source='vm_set.count', read_only=True)
    total_cpu = serializers.SerializerMethodField()
    total_ram = serializers.SerializerMethodField()
    total_disk = serializers.SerializerMethodField()

    class Meta:
        model = InfoSystem
        fields = ['id', 'name', 'code', 'vm_count', 'total_cpu', 'total_ram', 'total_disk', 'vms']

    def get_total_cpu(self, obj):
        return sum(vm.cpu for vm in obj.vm_set.all())

    def get_total_ram(self, obj):
        return sum(vm.ram for vm in obj.vm_set.all())

    def get_total_disk(self, obj):
        return sum(vm.disk for vm in obj.vm_set.all())

class StreamReportSerializer(serializers.ModelSerializer):
    info_systems = InfoSystemReportSerializer(source='infosystem_set', many=True, read_only=True)
    vm_count = serializers.SerializerMethodField()
    total_cpu = serializers.SerializerMethodField()
    total_ram = serializers.SerializerMethodField()
    total_disk = serializers.SerializerMethodField()

    class Meta:
        model = Stream
        fields = ['id', 'name', 'vm_count', 'total_cpu', 'total_ram', 'total_disk', 'info_systems']

    def get_vm_count(self, obj):
        return VM.objects.filter(info_system__stream=obj).count()

    def get_total_cpu(self, obj):
        return VM.objects.filter(info_system__stream=obj).aggregate(total=models.Sum('cpu'))['total'] or 0

    def get_total_ram(self, obj):
        return VM.objects.filter(info_system__stream=obj).aggregate(total=models.Sum('ram'))['total'] or 0

    def get_total_disk(self, obj):
        return VM.objects.filter(info_system__stream=obj).aggregate(total=models.Sum('disk'))['total'] or 0

class DepartmentReportSerializer(serializers.ModelSerializer):
    streams = StreamReportSerializer(source='stream_set', many=True, read_only=True)
    vm_count = serializers.SerializerMethodField()
    total_cpu = serializers.SerializerMethodField()
    total_ram = serializers.SerializerMethodField()
    total_disk = serializers.SerializerMethodField()

    class Meta:
        model = Department
        fields = [
            'id', 'name', 'short_name', 
            'cpu_quota', 'ram_quota', 'disk_quota',
            'vm_count', 'total_cpu', 'total_ram', 'total_disk',
            'streams'
        ]

    def get_vm_count(self, obj):
        return VM.objects.filter(info_system__stream__department=obj).count()

    def get_total_cpu(self, obj):
        return VM.objects.filter(info_system__stream__department=obj).aggregate(total=models.Sum('cpu'))['total'] or 0

    def get_total_ram(self, obj):
        return VM.objects.filter(info_system__stream__department=obj).aggregate(total=models.Sum('ram'))['total'] or 0

    def get_total_disk(self, obj):
        return VM.objects.filter(info_system__stream__department=obj).aggregate(total=models.Sum('disk'))['total'] or 0