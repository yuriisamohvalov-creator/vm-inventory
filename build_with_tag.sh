#!/bin/bash

# Script to build Docker images with custom tags in format:
# <git-branch>-DDMMYYYY-HHMM

# Get current git branch name
GIT_BRANCH=$(git branch --show-current)
if [ -z "$GIT_BRANCH" ]; then
    echo "Error: unable to determine current git branch."
    exit 1
fi

# Docker image tags support only [A-Za-z0-9_.-], so normalize branch name.
SAFE_BRANCH=$(echo "$GIT_BRANCH" | sed 's|/|-|g' | sed 's|[^A-Za-z0-9_.-]|-|g')

# Get current timestamp in DDMMYYYY-HHMM format
CURRENT_TIMESTAMP=$(date +%d%m%Y-%H%M)

# Final tag in format <git-branch>-DDMMYYYY-HHMM
FINAL_TAG="${SAFE_BRANCH}-${CURRENT_TIMESTAMP}"

echo "Building images with tag: $FINAL_TAG"

# Build each service with the custom tag
docker-compose build --no-cache

# Tag the built images
docker tag vm-inventory_backend backend:$FINAL_TAG
docker tag vm-inventory_frontend frontend:$FINAL_TAG
docker tag vm-inventory_nginx nginx:$FINAL_TAG

echo "Images built and tagged successfully:"
echo "  backend:$FINAL_TAG"
echo "  frontend:$FINAL_TAG"
echo "  nginx:$FINAL_TAG"

# Optionally push to registry (uncomment if needed)
# docker push backend:$FINAL_TAG
# docker push frontend:$FINAL_TAG
# docker push nginx:$FINAL_TAG