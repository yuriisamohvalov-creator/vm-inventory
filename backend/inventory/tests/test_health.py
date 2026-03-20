from rest_framework.test import APITestCase


class HealthEndpointsTests(APITestCase):
    def test_live_endpoint(self):
        response = self.client.get('/api/health/live/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['status'], 'ok')

    def test_ready_endpoint(self):
        response = self.client.get('/api/health/ready/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['status'], 'ready')
