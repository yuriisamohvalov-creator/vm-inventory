from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0011_vm_requests'),
    ]

    operations = [
        migrations.AddField(
            model_name='vmrequest',
            name='request_date',
            field=models.DateField(blank=True, null=True),
        ),
    ]
