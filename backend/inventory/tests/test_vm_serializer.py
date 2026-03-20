from django.test import TestCase

from inventory.models import Department, Stream, InfoSystem, VM
from inventory.serializers import VMSerializer


class VMSerializerValidationTests(TestCase):
    def setUp(self):
        dept = Department.objects.create(name='Dept')
        stream = Stream.objects.create(name='Stream', department=dept)
        self.info_system = InfoSystem.objects.create(name='IS', code='is_code', stream=stream)
        VM.objects.create(fqdn='existing.local', ip='10.0.0.1', info_system=self.info_system, tags=['LINUX', 'IS_CODE'])

    def test_ip_duplicate_validation_still_works(self):
        serializer = VMSerializer(data={
            'fqdn': 'new.local',
            'ip': '10.0.0.1',
            'cpu': 1,
            'ram': 1,
            'disk': 10,
            'instance': 1,
            'tags': ['LINUX', 'XXX'],
            'info_system': self.info_system.id,
        })
        self.assertFalse(serializer.is_valid())
        self.assertIn('ip', serializer.errors)
