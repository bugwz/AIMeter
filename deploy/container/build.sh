#!/usr/bin/env bash
set -euo pipefail

# Resolve project root (two levels up from deploy/docker/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "${PROJECT_ROOT}"

# Build image tag from git history
# Format: <latest-tag>-<commits-since-tag>-g<short-commit-id>
# Example: v1.2.3-5-gabcdef1
if git describe --tags --long > /dev/null 2>&1; then
  IMAGE_TAG="$(git describe --tags --long)"
else
  # No tags yet: fallback to 0.0-<total-commits>-g<short-id>
  COMMIT_COUNT="$(git rev-list --count HEAD)"
  SHORT_ID="$(git rev-parse --short HEAD)"
  IMAGE_TAG="0.0-${COMMIT_COUNT}-g${SHORT_ID}"
fi

IMAGE_NAME="bugwz/aimeter"
FULL_IMAGE="${IMAGE_NAME}:${IMAGE_TAG}"

# Detect container runtime: prefer podman, fall back to docker
if command -v podman > /dev/null 2>&1; then
  RUNTIME="podman"
elif command -v docker > /dev/null 2>&1; then
  RUNTIME="docker"
else
  echo "Error: neither podman nor docker found in PATH" >&2
  exit 1
fi

echo "Runtime: ${RUNTIME}"
echo "Image  : ${FULL_IMAGE}"
echo "Context: ${PROJECT_ROOT}"
echo ""

"${RUNTIME}" build \
  -f deploy/docker/Dockerfile \
  -t "${FULL_IMAGE}" \
  -t "${IMAGE_NAME}:latest" \
  .

echo ""
echo "Built: ${FULL_IMAGE}"
echo "Tagged: ${IMAGE_NAME}:latest"
