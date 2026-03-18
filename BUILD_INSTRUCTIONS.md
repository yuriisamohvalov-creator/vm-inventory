# Docker Image Build Instructions

## New Build Process with Custom Tags

The project uses a custom tagging system for Docker images in the format: `<git-branch>-DDMMYYYY-HHMM`

- `<git-branch>` - current git branch name (for example, `go-version-develop`)
- `DDMMYYYY` - current date (for example, `12032026`)
- `HHMM` - current time in 24-hour format (for example, `1542`)

## How to Build Images

### Using the Build Script (Recommended)

```bash
./build_with_tag.sh
```

This script will:
1. Get the current git branch name
2. Build the timestamp in `DDMMYYYY-HHMM` format
3. Build all images
4. Tag the images with the generated tag

### Manual Build Process

If you prefer to build manually:

```bash
# Build images
docker-compose build --no-cache

# Tag images manually (example)
docker tag vm-inventory_backend backend:go-version-develop-12032026-1542
docker tag vm-inventory_frontend frontend:go-version-develop-12032026-1542
docker tag vm-inventory_nginx nginx:go-version-develop-12032026-1542
```

## Example Tags

- Build on branch `go-version-develop`: `go-version-develop-12032026-1542`
- Build on branch `feature/api`: `feature-api-12032026-1542` (slash is replaced with `-`)

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

- Branch names are normalized for Docker tag compatibility (for example, `/` is replaced with `-`)
- Tag contains date and time, so each build gets a unique tag