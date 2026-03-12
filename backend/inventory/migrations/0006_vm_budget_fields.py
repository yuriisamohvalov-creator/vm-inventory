from django.db import migrations, models

class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0005_department_quotas'),
    ]

    operations = [
        migrations.AddField(
            model_name='vm',
            name='ba_pfm_zak',
            field=models.CharField(default='Z000000', help_text='БА.ПФМ_зак', max_length=255),
        ),
        migrations.AddField(
            model_name='vm',
            name='ba_pfm_isp',
            field=models.CharField(default='Z000000', help_text='БА.ПФМ_исп', max_length=255),
        ),
        migrations.AddField(
            model_name='vm',
            name='ba_programma_byudzheta',
            field=models.CharField(blank=True, help_text='БА.Программа_бюджета', max_length=255, null=True),
        ),
        migrations.AddField(
            model_name='vm',
            name='ba_finansovaya_pozitsiya',
            field=models.CharField(default='00.00.00.00', help_text='БА.Финансовая_позиция', max_length=255),
        ),
        migrations.AddField(
            model_name='vm',
            name='ba_mir_kod',
            field=models.CharField(default='ITI_000_0000', help_text='БА.Mir-код', max_length=255),
        ),
    ]