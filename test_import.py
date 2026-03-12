ne fiximport sys
import os
sys.path.append('backend')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'vm_inventory.settings')
import django
django.setup()

# Try to import Django db models
try:
    from django.db import migrations, models
    print("Django import successful!")
    print(f"Django version: {django.__version__}")
    print(f"Migrations module: {migrations}")
    print(f"Models module: {models}")
except Exception as e:
    print(f"Error importing Django: {e}")