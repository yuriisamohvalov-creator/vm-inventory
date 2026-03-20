from django.contrib import admin
from .models import Department, Stream, InfoSystem, VM, VMRequest, Pool, PoolVM, UserProfile


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


@admin.register(VMRequest)
class VMRequestAdmin(admin.ModelAdmin):
    list_display = ('vm', 'request_type', 'request_number', 'contractor_task_number', 'created_at', 'updated_at', 'deleted_at')
    list_filter = ('request_type',)
    search_fields = ('vm__fqdn', 'request_number', 'contractor_task_number')


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ('user', 'must_change_password', 'created_at', 'updated_at')
    list_filter = ('must_change_password',)
    search_fields = ('user__username',)
