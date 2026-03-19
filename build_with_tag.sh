#!/usr/bin/env bash
set -euo pipefail

# Build and tag service images with custom tag:
# <git-branch>-DDMMYYYY-HHMM

SERVICES=(backend frontend nginx)
DRY_RUN=false
REGISTRY_PREFIX=""

usage() {
  cat <<'EOF'
Usage:
  ./build_with_tag.sh [--dry-run] [--registry <prefix>] [--help]

Options:
  --dry-run             Print planned actions without executing build/tag.
  --registry <prefix>   Tag images as <prefix>/<service>:<tag>
                        Example: --registry my-registry.local/project
  --help                Show this help.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --registry)
      if [ "$#" -lt 2 ] || [ -z "${2:-}" ]; then
        echo "Error: --registry requires a non-empty value."
        usage
        exit 1
      fi
      REGISTRY_PREFIX="${2%/}"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Error: unknown option '$1'."
      usage
      exit 1
      ;;
  esac
done

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
if [ -n "${REGISTRY_PREFIX}" ]; then
  echo "Registry prefix: ${REGISTRY_PREFIX}"
fi
if [ "${DRY_RUN}" = true ]; then
  echo "Mode: dry-run (no changes will be made)"
fi

if [ "${DRY_RUN}" = true ]; then
  echo "+ ${COMPOSE_CMD[*]} build --no-cache ${SERVICES[*]}"
else
  "${COMPOSE_CMD[@]}" build --no-cache "${SERVICES[@]}"
fi

for svc in "${SERVICES[@]}"; do
  if [ "${DRY_RUN}" = true ]; then
    echo "+ ${COMPOSE_CMD[*]} images -q ${svc}"
    image_id="<image-id:${svc}>"
  else
    image_id="$("${COMPOSE_CMD[@]}" images -q "${svc}" | awk 'NF{print; exit}')"
  fi

  if [ -z "${image_id}" ]; then
    echo "Error: unable to resolve image ID for service '${svc}'."
    exit 1
  fi

  target_repo="${svc}"
  if [ -n "${REGISTRY_PREFIX}" ]; then
    target_repo="${REGISTRY_PREFIX}/${svc}"
  fi
  target_tag="${target_repo}:${FINAL_TAG}"

  if [ "${DRY_RUN}" = true ]; then
    echo "+ docker tag ${image_id} ${target_tag}"
  else
    docker tag "${image_id}" "${target_tag}"
    echo "Tagged: ${target_tag} (from ${image_id})"
  fi
done

echo "Images built and tagged successfully."
for svc in "${SERVICES[@]}"; do
  target_repo="${svc}"
  if [ -n "${REGISTRY_PREFIX}" ]; then
    target_repo="${REGISTRY_PREFIX}/${svc}"
  fi
  echo "  ${target_repo}:${FINAL_TAG}"
done

# Optionally push to registry (uncomment if needed):
# docker push "${REGISTRY_PREFIX:+${REGISTRY_PREFIX}/}backend:${FINAL_TAG}"
# docker push "${REGISTRY_PREFIX:+${REGISTRY_PREFIX}/}frontend:${FINAL_TAG}"
# docker push "${REGISTRY_PREFIX:+${REGISTRY_PREFIX}/}nginx:${FINAL_TAG}"