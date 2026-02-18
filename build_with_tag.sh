#!/bin/bash

# Script to build Docker images with custom tags in format: YYYYMMDD-vXXX
# where XXX is a 3-digit number starting from 000

# Get current date in YYYYMMDD format
CURRENT_DATE=$(date +%Y%m%d)

# Find the highest existing tag number for today
HIGHEST_TAG=0
for tag in $(docker images --format "{{.Tag}}" | grep "^${CURRENT_DATE}-v" || true); do
    # Extract the number part (XXX) from tag like "20260218-v001"
    number_part=$(echo "$tag" | sed "s/${CURRENT_DATE}-v//")
    # Remove leading zeros and convert to integer
    number=${number_part#0}
    if [[ "$number" =~ ^[0-9]+$ ]] && [ "$number" -gt "$HIGHEST_TAG" ]; then
        HIGHEST_TAG=$number
    fi
done

# Calculate next tag number (n+1)
NEXT_TAG=$((HIGHEST_TAG + 1))

# Format the tag number as 3-digit with leading zeros
FORMATTED_TAG=$(printf "%03d" "$NEXT_TAG")

# Final tag in format YYYYMMDD-vXXX
FINAL_TAG="${CURRENT_DATE}-v${FORMATTED_TAG}"

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