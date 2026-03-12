from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0006_vm_budget_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='stream',
            name='cpu_quota',
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name='stream',
            name='disk_quota',
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name='stream',
            name='ram_quota',
            field=models.PositiveIntegerField(default=0),
        ),
    ]
