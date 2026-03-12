from django.core.management.base import BaseCommand
from inventory.models import VM

class Command(BaseCommand):
    help = 'Set default values for BA fields on existing VM records'

    def handle(self, *args, **options):
        # Update all existing VMs with default values for the new BA fields
        updated_count = VM.objects.filter(
            ba_pfm_zak__isnull=True
        ).update(
            ba_pfm_zak='Z000000',
            ba_pfm_isp='Z000000',
            ba_programma_byudzheta=None,
            ba_finansovaya_pozitsiya='00.00.00.00',
            ba_mir_kod='ITI_000_0000'
        )

        self.stdout.write(self.style.SUCCESS(f'Successfully updated {updated_count} VM records with default BA values'))