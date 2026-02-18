from django.db import models


class Department(models.Model):
    name = models.CharField(max_length=255)
    short_name = models.CharField(max_length=255, blank=True, default='')

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class Stream(models.Model):
    name = models.CharField(max_length=255)
    department = models.ForeignKey(Department, on_delete=models.CASCADE, related_name='streams')

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class InfoSystem(models.Model):
    name = models.CharField(max_length=255)
    code = models.CharField(max_length=255, blank=True, default='')
    is_id = models.CharField(max_length=255, blank=True, default='')
    stream = models.ForeignKey(Stream, on_delete=models.PROTECT, related_name='info_systems')

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


def build_tags(os_tag, info_system_code, custom_tags):
    """Build tags list: [OS, IS_CODE, ...custom in UPPER_CASE]."""
    tags = [os_tag.upper() if os_tag else 'LINUX']
    tags.append((info_system_code or '').strip().upper().replace(' ', '_'))
    for t in (custom_tags or []):
        tag = (t or '').strip().upper().replace(' ', '_')
        if tag and tag not in tags:
            tags.append(tag)
    return tags


class VM(models.Model):
    OS_CHOICES = [
        ('LINUX', 'Linux'),
        ('WINDOWS', 'Windows'),
        ('MACOS', 'MacOS'),
    ]

    fqdn = models.CharField(max_length=255, unique=True)
    ip = models.CharField(max_length=15, default='000.000.000.000')
    cpu = models.PositiveIntegerField(default=1)
    ram = models.PositiveIntegerField(default=1)  # GB
    disk = models.PositiveIntegerField(default=10)  # GB
    instance = models.PositiveSmallIntegerField(default=1)  # 1-20
    tags = models.JSONField(default=list)  # [OS, IS_NAME, custom...]
    info_system = models.ForeignKey(
        InfoSystem, on_delete=models.SET_NULL, null=True, blank=True, related_name='vms'
    )

    class Meta:
        ordering = ['instance', 'fqdn']
        constraints = [
            models.CheckConstraint(check=models.Q(instance__gte=1, instance__lte=20), name='instance_1_20'),
        ]

    def __str__(self):
        return self.fqdn

    @property
    def department_id(self):
        if self.info_system_id:
            return self.info_system.stream.department_id
        return None


class Pool(models.Model):
    name = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.name

    def instance_value(self):
        """Instance number for this pool (all VMs in pool must have same instance)."""
        first = self.pool_vms.filter(removed_at__isnull=True).first()
        return first.vm.instance if first else None


class PoolVM(models.Model):
    pool = models.ForeignKey(Pool, on_delete=models.CASCADE, related_name='pool_vms')
    vm = models.ForeignKey(VM, on_delete=models.CASCADE, related_name='pool_vms')
    added_at = models.DateTimeField(auto_now_add=True)
    removed_at = models.DateTimeField(null=True, blank=True)
    original_tags = models.JSONField(default=list, null=True, blank=True)  # Теги ВМ до добавления в пул

    class Meta:
        unique_together = [('pool', 'vm')]
        ordering = ['-added_at']

    def __str__(self):
        return f"{self.pool.name} — {self.vm.fqdn}"
