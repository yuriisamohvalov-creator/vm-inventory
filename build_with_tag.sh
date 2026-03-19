#!/usr/bin/env bash
set -euo pipefail

# Build and tag service images with custom tag:
# <git-branch>-DDMMYYYY-HHMM

SERVICES=(backend frontend nginx)

if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  COMPOSE_CMD=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD=(docker-compose)
else
  echo "Error: neither 'docker compose' nor 'docker-compose' is available."
  exit 1
fi

GIT_BRANCH="$(git branch --show-current || true)"
if [ -z "${GIT_BRANCH}" ]; then
  echo "Error: unable to determine current git branch."
  exit 1
fi

# Docker tag charset: [A-Za-z0-9_.-]
SAFE_BRANCH="$(echo "${GIT_BRANCH}" | sed 's|/|-|g' | sed 's|[^A-Za-z0-9_.-]|-|g')"
CURRENT_TIMESTAMP="$(date +%d%m%Y-%H%M)"
FINAL_TAG="${SAFE_BRANCH}-${CURRENT_TIMESTAMP}"

echo "Compose command: ${COMPOSE_CMD[*]}"
echo "Building services: ${SERVICES[*]}"
echo "Tag: ${FINAL_TAG}"

"${COMPOSE_CMD[@]}" build --no-cache "${SERVICES[@]}"

for svc in "${SERVICES[@]}"; do
  image_id="$("${COMPOSE_CMD[@]}" images -q "${svc}" | awk 'NF{print; exit}')"
  if [ -z "${image_id}" ]; then
    echo "Error: unable to resolve image ID for service '${svc}'."
    exit 1
  fi

  docker tag "${image_id}" "${svc}:${FINAL_TAG}"
  echo "Tagged: ${svc}:${FINAL_TAG} (from ${image_id})"
done

echo "Images built and tagged successfully."
echo "  backend:${FINAL_TAG}"
echo "  frontend:${FINAL_TAG}"
echo "  nginx:${FINAL_TAG}"

# Optionally push to registry (uncomment if needed):
# docker push "backend:${FINAL_TAG}"
# docker push "frontend:${FINAL_TAG}"
# docker push "nginx:${FINAL_TAG}"