# Docker Image Build Instructions

## New Build Process with Custom Tags

The project now uses a custom tagging system for Docker images in the format: `YYYYMMDD-vXXX`

- `YYYYMMDD` - current date (e.g., 20260218 for February 18, 2026)
- `vXXX` - 3-digit version number starting from 000 (e.g., v001, v002, etc.)

## How to Build Images

### Using the Build Script (Recommended)

```bash
./build_with_tag.sh
```

This script will:
1. Get the current date
2. Find the highest existing tag number for today
3. Increment it by 1
4. Build all images with the new tag
5. Tag the images appropriately

### Manual Build Process

If you prefer to build manually:

```bash
# Build images
docker-compose build --no-cache

# Tag images manually (example for 2026-02-18, version 1)
docker tag vm-inventory_backend backend:20260218-v001
docker tag vm-inventory_frontend frontend:20260218-v001
docker tag vm-inventory_nginx nginx:20260218-v001
```

## Example Tag Sequence

- First build on Feb 18, 2026: `20260218-v001`
- Second build on Feb 18, 2026: `20260218-v002`
- First build on Feb 19, 2026: `20260219-v001`

## Running with Custom Tags

To run the containers with your custom tags, you'll need to modify the `docker-compose.yml` file or use `docker run` commands directly.

## Pushing to Registry

The build script includes commented-out push commands. Uncomment them if you need to push to a container registry:

```bash
docker push backend:$FINAL_TAG
docker push frontend:$FINAL_TAG
docker push nginx:$FINAL_TAG
```

## Notes

- The script automatically finds the highest existing tag number for the current date
- Version numbers reset to 001 each day
- Tags are always 3 digits with leading zeros (001, 002, ..., 999)