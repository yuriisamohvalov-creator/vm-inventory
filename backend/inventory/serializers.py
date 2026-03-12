from rest_framework import serializers
from .models import Department, Stream, InfoSystem, VM, Pool, PoolVM


class DepartmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Department
        fields = ['id', 'name', 'short_name']


class StreamSerializer(serializers.ModelSerializer):
    department_name = serializers.CharField(source='department.name', read_only=True)

    class Meta:
        model = Stream
        fields = ['id', 'name', 'department', 'department_name']


class InfoSystemSerializer(serializers.ModelSerializer):
    stream_name = serializers.CharField(source='stream.name', read_only=True)
    department_name = serializers.CharField(source='stream.department.name', read_only=True)

    class Meta:
        model = InfoSystem
        fields = ['id', 'name', 'code', 'is_id', 'stream', 'stream_name', 'department_name']


class VMSerializer(serializers.ModelSerializer):
    info_system_name = serializers.SerializerMethodField()
    info_system_code = serializers.SerializerMethodField()
    department_name = serializers.SerializerMethodField()
    stream_name = serializers.SerializerMethodField()

    class Meta:
        model = VM
        fields = [
            'id', 'fqdn', 'ip', 'cpu', 'ram', 'disk', 'instance', 'tags',
            'info_system', 'info_system_name', 'info_system_code',
            'department_name', 'stream_name',
            'ba_pfm_zak', 'ba_pfm_isp', 'ba_programma_byudzheta',
            'ba_finansovaya_pozitsiya', 'ba_mir_kod'
        ]

    def get_info_system_name(self, obj):
        return obj.info_system.name if obj.info_system else None

    def get_info_system_code(self, obj):
        return (obj.info_system.code or '').strip() if obj.info_system else ''

    def get_department_name(self, obj):
        if obj.info_system and obj.info_system.stream and obj.info_system.stream.department:
            return obj.info_system.stream.department.name
        return None

    def get_stream_name(self, obj):
        if obj.info_system and obj.info_system.stream:
            return obj.info_system.stream.name
        return None

    def validate_fqdn(self, value):
        value = (value or '').strip()
        if not value:
            raise serializers.ValidationError('FQDN обязателен.')
        return value

    def validate_ip(self, value):
        import re
        value = (value or '').strip()
        if not value:
            raise serializers.ValidationError('IP адрес обязателен.')
        # Проверка формата IP (простая проверка на формат xxx.xxx.xxx.xxx)
        ip_pattern = r'^(\d{1,3}\.){3}\d{1,3}$'
        if not re.match(ip_pattern, value):
            raise serializers.ValidationError('Неверный формат IP адреса. Ожидается формат: xxx.xxx.xxx.xxx')
        # Проверка на значение по умолчанию
        if value == '000.000.000.000':
            return value
        # Проверка диапазонов октетов
        parts = value.split('.')
        for part in parts:
            num = int(part)
            if num < 0 or num > 255:
                raise serializers.ValidationError('Каждый октет IP адреса должен быть от 0 до 255.')
        return value

    def validate(self, attrs):
        # Проверка на дубликаты IP (кроме текущей ВМ при редактировании)
        ip_value = attrs.get('ip')
        if ip_value and ip_value != '000.000.000.000':
            instance = self.instance
            qs = VM.objects.filter(ip=ip_value)
            if instance:
                qs = qs.exclude(pk=instance.pk)
            if qs.exists():
                raise serializers.ValidationError({
                    'ip': f'ВМ с IP адресом {ip_value} уже существует: {qs.first().fqdn}'
                })
        return super().validate(attrs)

    def validate_instance(self, value):
        if value is None or value < 1 or value > 20:
            raise serializers.ValidationError('Instance должен быть от 1 до 20.')
        return value

    def validate_ba_pfm_zak(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError('БА.ПФМ_зак обязателен.')
        return value.strip()

    def validate_ba_pfm_isp(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError('БА.ПФМ_исп обязателен.')
        return value.strip()

    def validate_ba_finansovaya_pozitsiya(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError('БА.Финансовая_позиция обязательна.')
        return value.strip()

    def validate_ba_mir_kod(self, value):
        if not value or not value.strip():
            raise serializers.ValidationError('БА.Mir-код обязателен.')
        return value.strip()

    def validate_tags(self, value):
        if not isinstance(value, list):
            return []
        return [str(t).strip().upper().replace(' ', '_') for t in value if str(t).strip()]

    def _is_code_tag(self, is_obj):
        return (is_obj.code or '').strip().upper().replace(' ', '_')

    def validate(self, attrs):
        os_tag = attrs.get('tags') and len(attrs['tags']) > 0 and attrs['tags'][0]
        if os_tag and os_tag not in ('LINUX', 'WINDOWS', 'MACOS'):
            raise serializers.ValidationError({'tags': 'Первый тег должен быть LINUX, WINDOWS или MACOS.'})
        info_system = attrs.get('info_system')
        if info_system and isinstance(attrs.get('tags'), list) and len(attrs['tags']) >= 2:
            is_code = self._is_code_tag(info_system)
            if attrs['tags'][1] != is_code:
                attrs['tags'] = [attrs['tags'][0], is_code] + list(attrs['tags'][2:])
        return attrs

    def create(self, validated_data):
        info_system = validated_data.get('info_system')
        tags = validated_data.get('tags') or []
        if len(tags) < 1:
            tags = ['LINUX']
        if len(tags) < 2 and info_system:
            tags = tags + [self._is_code_tag(info_system)]
        elif info_system and len(tags) >= 2:
            tags[1] = self._is_code_tag(info_system)
        validated_data['tags'] = tags
        return super().create(validated_data)

    def update(self, instance, validated_data):
        info_system = validated_data.get('info_system', instance.info_system)
        tags = validated_data.get('tags', instance.tags) or []
        if len(tags) < 1:
            tags = ['LINUX']
        if info_system:
            is_tag = self._is_code_tag(info_system)
            if len(tags) < 2:
                tags = [tags[0], is_tag] + list(tags[2:])
            else:
                tags = [tags[0], is_tag] + list(tags[2:])
        validated_data['tags'] = tags
        return super().update(instance, validated_data)


class PoolSerializer(serializers.ModelSerializer):
    pool_tags = serializers.SerializerMethodField()

    class Meta:
        model = Pool
        fields = ['id', 'name', 'created_at', 'pool_tags']

    def get_pool_tags(self, obj):
        """Теги пула (из любой ВМ в пуле, они все одинаковые после синхронизации)."""
        pv = obj.pool_vms.filter(removed_at__isnull=True).select_related('vm').first()
        if pv and pv.vm:
            return pv.vm.tags or []
        return []


class PoolVMSerializer(serializers.ModelSerializer):
    vm_fqdn = serializers.CharField(source='vm.fqdn', read_only=True)
    vm_instance = serializers.IntegerField(source='vm.instance', read_only=True)

    class Meta:
        model = PoolVM
        fields = ['id', 'pool', 'vm', 'vm_fqdn', 'vm_instance', 'added_at', 'removed_at']


class PoolDetailSerializer(serializers.ModelSerializer):
    vms_in_pool = serializers.SerializerMethodField()
    instance_value = serializers.SerializerMethodField()
    pool_tags = serializers.SerializerMethodField()

    class Meta:
        model = Pool
        fields = ['id', 'name', 'created_at', 'vms_in_pool', 'instance_value', 'pool_tags']

    def get_vms_in_pool(self, obj):
        qs = obj.pool_vms.filter(removed_at__isnull=True).select_related('vm')
        return [{'id': pv.vm_id, 'fqdn': pv.vm.fqdn, 'instance': pv.vm.instance} for pv in qs]

    def get_instance_value(self, obj):
        return obj.instance_value()

    def get_pool_tags(self, obj):
        """Теги пула (из любой ВМ в пуле, они все одинаковые после синхронизации)."""
        pv = obj.pool_vms.filter(removed_at__isnull=True).select_related('vm').first()
        if pv and pv.vm:
            return pv.vm.tags or []
        return []
