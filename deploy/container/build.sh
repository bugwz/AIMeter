#!/usr/bin/env bash
set -euo pipefail

# Resolve project root (two levels up from deploy/container/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "${PROJECT_ROOT}"

# Detect default platform from current machine architecture
ARCH=$(uname -m)
case "$ARCH" in
  x86_64)        DEFAULT_PLATFORM="linux/amd64" ;;
  aarch64|arm64) DEFAULT_PLATFORM="linux/arm64" ;;
  *)             DEFAULT_PLATFORM="linux/amd64" ;;
esac

# Defaults
PLATFORM="${DEFAULT_PLATFORM}"
PUSH=false
IMAGE_NAME="bugwz/aimeter"
IMAGE_TAG=""

usage() {
  cat <<EOF
Usage: build.sh [OPTIONS]

Options:
  --platform <platforms>   Target platform(s), comma-separated [default: ${DEFAULT_PLATFORM}]
                           Supported platforms:
                             linux/amd64              x86_64 Linux (standard servers/VPS)
                             linux/arm64              ARM64 Linux (AWS Graviton, Apple Silicon Docker)
                             linux/amd64,linux/arm64  Multi-arch (requires --push)
  --push                   Push image(s) to registry [default: false]
                           Required when building for multiple platforms
  --name <name>            Image name [default: bugwz/aimeter]
  --tag <tag>              Image tag [default: auto-generated from git]
  -h, --help               Show this help message

Examples:
  ./build.sh                                             # Local build (current arch)
  ./build.sh --platform linux/amd64                     # Build for x86_64 Linux
  ./build.sh --platform linux/arm64                     # Build for ARM64 Linux
  ./build.sh --platform linux/amd64,linux/arm64 --push  # Multi-arch, push to registry
  ./build.sh --platform linux/amd64 --push              # Single arch, push to registry
EOF
}

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --platform)
      PLATFORM="$2"; shift 2 ;;
    --push)
      PUSH=true; shift ;;
    --name)
      IMAGE_NAME="$2"; shift 2 ;;
    --tag)
      IMAGE_TAG="$2"; shift 2 ;;
    -h|--help)
      usage; exit 0 ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1 ;;
  esac
done

# Auto-generate image tag from git history if not overridden
if [ -z "${IMAGE_TAG}" ]; then
  if git describe --tags --long > /dev/null 2>&1; then
    IMAGE_TAG="$(git describe --tags --long)"
  else
    COMMIT_COUNT="$(git rev-list --count HEAD)"
    SHORT_ID="$(git rev-parse --short HEAD)"
    IMAGE_TAG="0.0-${COMMIT_COUNT}-g${SHORT_ID}"
  fi
fi

FULL_IMAGE="${IMAGE_NAME}:${IMAGE_TAG}"

# Count platforms (multi-platform = comma in string)
PLATFORM_COUNT=$(echo "${PLATFORM}" | tr ',' '\n' | wc -l | tr -d ' ')
IS_MULTI_PLATFORM=false
if [ "${PLATFORM_COUNT}" -gt 1 ]; then
  IS_MULTI_PLATFORM=true
fi

# Validate: multi-platform requires --push (Docker cannot load multi-arch to local daemon)
if [ "${IS_MULTI_PLATFORM}" = true ] && [ "${PUSH}" = false ]; then
  echo "Error: building for multiple platforms requires --push (Docker cannot load multi-arch images locally)." >&2
  echo "       Use: --platform ${PLATFORM} --push" >&2
  exit 1
fi

# Detect container runtime
if command -v podman > /dev/null 2>&1; then
  RUNTIME="podman"
elif command -v docker > /dev/null 2>&1; then
  RUNTIME="docker"
else
  echo "Error: neither podman nor docker found in PATH" >&2
  exit 1
fi

echo "Runtime : ${RUNTIME}"
echo "Image   : ${FULL_IMAGE}"
echo "Platform: ${PLATFORM}"
echo "Push    : ${PUSH}"
echo "Context : ${PROJECT_ROOT}"
echo ""

if [ "${RUNTIME}" = "docker" ]; then
  if [ "${IS_MULTI_PLATFORM}" = true ]; then
    # Multi-platform: requires buildx with docker-container driver
    if ! docker buildx inspect aimeter-builder &>/dev/null; then
      echo "Creating buildx builder 'aimeter-builder'..."
      docker buildx create --name aimeter-builder --driver docker-container --bootstrap
    fi
    docker buildx build \
      --builder aimeter-builder \
      --platform "${PLATFORM}" \
      -f deploy/container/Dockerfile \
      -t "${FULL_IMAGE}" \
      -t "${IMAGE_NAME}:latest" \
      --push \
      .
  elif [ "${PUSH}" = true ]; then
    # Single platform + push: buildx with --push
    docker buildx build \
      --platform "${PLATFORM}" \
      -f deploy/container/Dockerfile \
      -t "${FULL_IMAGE}" \
      -t "${IMAGE_NAME}:latest" \
      --push \
      .
  else
    # Single platform, local only
    docker build \
      --platform "${PLATFORM}" \
      -f deploy/container/Dockerfile \
      -t "${FULL_IMAGE}" \
      -t "${IMAGE_NAME}:latest" \
      .
  fi
else
  # Podman path
  if [ "${IS_MULTI_PLATFORM}" = true ]; then
    # Build each platform separately, then combine into a manifest
    MANIFEST="${IMAGE_NAME}:latest"
    VERSIONED_MANIFEST="${FULL_IMAGE}"
    podman manifest rm "${MANIFEST}" 2>/dev/null || true
    podman manifest create "${MANIFEST}"
    for P in $(echo "${PLATFORM}" | tr ',' ' '); do
      ARCH_TAG="${IMAGE_NAME}:${IMAGE_TAG}-$(echo "${P}" | tr '/' '-')"
      podman build \
        --platform "${P}" \
        -f deploy/container/Dockerfile \
        -t "${ARCH_TAG}" \
        .
      podman manifest add "${MANIFEST}" "${ARCH_TAG}"
    done
    podman manifest push "${MANIFEST}" "docker://${MANIFEST}"
    podman manifest push "${MANIFEST}" "docker://${VERSIONED_MANIFEST}"
  elif [ "${PUSH}" = true ]; then
    podman build \
      --platform "${PLATFORM}" \
      -f deploy/container/Dockerfile \
      -t "${FULL_IMAGE}" \
      -t "${IMAGE_NAME}:latest" \
      .
    podman push "${FULL_IMAGE}"
    podman push "${IMAGE_NAME}:latest"
  else
    podman build \
      --platform "${PLATFORM}" \
      -f deploy/container/Dockerfile \
      -t "${FULL_IMAGE}" \
      -t "${IMAGE_NAME}:latest" \
      .
  fi
fi

echo ""
if [ "${IS_MULTI_PLATFORM}" = true ]; then
  echo "Pushed (multi-arch manifest: $(echo "${PLATFORM}" | tr ',' ', ')):"
  echo "  ${FULL_IMAGE}"
  echo "  ${IMAGE_NAME}:latest"
elif [ "${PUSH}" = true ]; then
  echo "Pushed (${PLATFORM}):"
  echo "  ${FULL_IMAGE}"
  echo "  ${IMAGE_NAME}:latest"
else
  echo "Built (${PLATFORM}):"
  echo "  ${FULL_IMAGE}"
  echo "  ${IMAGE_NAME}:latest"
fi
