from django.db import migrations


def create_roles_and_permissions(apps, schema_editor):
    Group = apps.get_model('auth', 'Group')
    Permission = apps.get_model('auth', 'Permission')

    model_names = ['department', 'stream', 'infosystem', 'vm', 'pool', 'poolvm']
    admin_codenames = []
    analyst_codenames = ['can_export_reports']

    for model in model_names:
        admin_codenames.extend(
            [f'view_{model}', f'add_{model}', f'change_{model}', f'delete_{model}']
        )
        analyst_codenames.append(f'view_{model}')

    admin_perms = Permission.objects.filter(
        content_type__app_label='inventory',
        codename__in=admin_codenames + ['can_export_reports'],
    )
    analyst_perms = Permission.objects.filter(
        content_type__app_label='inventory',
        codename__in=analyst_codenames,
    )

    admin_group, _ = Group.objects.get_or_create(name='Administrators')
    analyst_group, _ = Group.objects.get_or_create(name='Analysts')

    admin_group.permissions.set(admin_perms)
    analyst_group.permissions.set(analyst_perms)


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ('inventory', '0007_stream_quotas'),
    ]

    operations = [
        migrations.AlterModelOptions(
            name='department',
            options={
                'ordering': ['name'],
                'permissions': [('can_export_reports', 'Can export reports')],
            },
        ),
        migrations.RunPython(create_roles_and_permissions, noop_reverse),
    ]
