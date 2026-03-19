from django.contrib import admin
from .models import Department, Stream, InfoSystem, VM, Pool, PoolVM


@admin.register(Department)
class DepartmentAdmin(admin.ModelAdmin):
    list_display = ('id', 'name', 'short_name', 'cpu_quota', 'ram_quota', 'disk_quota')


@admin.register(Stream)
class StreamAdmin(admin.ModelAdmin):
    list_display = ('id', 'name', 'department', 'cpu_quota', 'ram_quota', 'disk_quota')
    list_filter = ('department',)


@admin.register(InfoSystem)
class InfoSystemAdmin(admin.ModelAdmin):
    list_display = ('id', 'name', 'code', 'is_id', 'stream')
    list_filter = ('stream',)


@admin.register(VM)
class VMAdmin(admin.ModelAdmin):
    list_display = ('fqdn', 'ip', 'cpu', 'ram', 'disk', 'instance', 'info_system', 'is_active', 'created_at', 'updated_at', 'deleted_at')
    list_filter = ('instance', 'is_active')
    search_fields = ('fqdn', 'ip')


@admin.register(Pool)
class PoolAdmin(admin.ModelAdmin):
    list_display = ('id', 'name', 'created_at')


@admin.register(PoolVM)
class PoolVMAdmin(admin.ModelAdmin):
    list_display = ('pool', 'vm', 'added_at', 'removed_at')
