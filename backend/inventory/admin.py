from django.contrib import admin
from .models import Department, Stream, InfoSystem, VM, Pool, PoolVM


@admin.register(Department)
class DepartmentAdmin(admin.ModelAdmin):
    list_display = ('id', 'name', 'short_name')


@admin.register(Stream)
class StreamAdmin(admin.ModelAdmin):
    list_display = ('id', 'name', 'department')
    list_filter = ('department',)


@admin.register(InfoSystem)
class InfoSystemAdmin(admin.ModelAdmin):
    list_display = ('id', 'name', 'code', 'stream')
    list_filter = ('stream',)


@admin.register(VM)
class VMAdmin(admin.ModelAdmin):
    list_display = ('fqdn', 'cpu', 'ram', 'disk', 'instance', 'info_system')
    list_filter = ('instance',)
    search_fields = ('fqdn',)


@admin.register(Pool)
class PoolAdmin(admin.ModelAdmin):
    list_display = ('id', 'name', 'created_at')


@admin.register(PoolVM)
class PoolVMAdmin(admin.ModelAdmin):
    list_display = ('pool', 'vm', 'added_at', 'removed_at')
