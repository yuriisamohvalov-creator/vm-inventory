from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0008_rbac_roles_and_export_permission'),
    ]

    operations = [
        migrations.AddField(
            model_name='vm',
            name='created_at',
            field=models.DateTimeField(auto_now_add=True, null=True),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name='vm',
            name='updated_at',
            field=models.DateTimeField(auto_now=True, null=True),
        ),
        migrations.AddField(
            model_name='vm',
            name='deleted_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='vm',
            name='is_active',
            field=models.BooleanField(default=True),
        ),
    ]
