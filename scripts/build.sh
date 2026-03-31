#!/usr/bin/env bash
# LinkKVM Build Script
# Usage:
#   ./scripts/build.sh                  # Build for current platform
#   ./scripts/build.sh --target linux   # Specify target platform (macos / windows / linux)
#   ./scripts/build.sh --debug          # Build in debug mode
#   ./scripts/build.sh --all            # Cross-compile all platforms (requires corresponding toolchains)

set -euo pipefail

# Resolve symlinks to get real script directory (supports symlink invocation)
resolve_script_dir() {
  local source="$0"
  while [[ -L "$source" ]]; do
    local dir
    dir="$(cd -P "$(dirname "$source")" && pwd)"
    source="$(readlink "$source")"
    [[ "$source" != /* ]] && source="$dir/$source"
  done
  cd -P "$(dirname "$source")" && pwd
}

# If invoked via symlink, use parent directory of caller path ($0) as project directory
# This way symlink invocation in local-view resolves to local-view rather than remote source
CALLER_SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$CALLER_SCRIPT_DIR/.." && pwd)"
SCRIPT_DIR="$(resolve_script_dir)"
BUILD_MODE="release"
TARGET_PLATFORM=""
BUILD_ALL=false

# ---------- Parse arguments ----------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)
      TARGET_PLATFORM="$2"
      shift 2
      ;;
    --debug)
      BUILD_MODE="debug"
      shift
      ;;
    --all)
      BUILD_ALL=true
      shift
      ;;
    -h|--help)
      echo "Usage: $0 [options]"
      echo ""
      echo "Options:"
      echo "  --target <platform>  Specify target platform: macos, windows, linux"
      echo "  --debug              Build in debug mode"
      echo "  --all                Build all platforms (requires corresponding cross-compile toolchains)"
      echo "  -h, --help           Show help"
      exit 0
      ;;
    *)
      echo "Unknown argument: $1"
      exit 1
      ;;
  esac
done

# ---------- Environment detection ----------
detect_platform() {
  case "$(uname -s)" in
    Darwin*)  echo "macos" ;;
    Linux*)   echo "linux" ;;
    MINGW*|MSYS*|CYGWIN*) echo "windows" ;;
    *)        echo "unknown" ;;
  esac
}

CURRENT_PLATFORM="$(detect_platform)"

check_prerequisites() {
  local missing=()

  if ! command -v node &>/dev/null; then
    missing+=("Node.js")
  fi

  if ! command -v npm &>/dev/null; then
    missing+=("npm")
  fi

  if ! command -v cargo &>/dev/null; then
    missing+=("Rust (cargo)")
  fi

  if [[ ${#missing[@]} -gt 0 ]]; then
    echo "[ERROR] Missing the following dependencies:"
    printf '  - %s\n' "${missing[@]}"
    echo ""
    echo "Please install the above tools and try again."
    exit 1
  fi

  echo "[OK] Build environment check passed"
}

# ---------- Install system dependencies (Linux) ----------
install_linux_deps() {
  if [[ "$CURRENT_PLATFORM" != "linux" ]]; then
    return
  fi

  echo "[INFO] Checking Linux system dependencies..."

  local deps=(
    libwebkit2gtk-4.1-dev
    libappindicator3-dev
    librsvg2-dev
    patchelf
    libssl-dev
    libgtk-3-dev
    libudev-dev
  )

  local missing_deps=()
  for dep in "${deps[@]}"; do
    if ! dpkg -s "$dep" &>/dev/null 2>&1; then
      missing_deps+=("$dep")
    fi
  done

  if [[ ${#missing_deps[@]} -gt 0 ]]; then
    echo "[INFO] Installing missing system dependencies: ${missing_deps[*]}"
    sudo apt-get update
    sudo apt-get install -y "${missing_deps[@]}"
  else
    echo "[OK] Linux system dependencies ready"
  fi
}

# ---------- Rust targets ----------
get_rust_targets() {
  local platform="$1"
  case "$platform" in
    macos)
      echo "x86_64-apple-darwin aarch64-apple-darwin"
      ;;
    windows)
      echo "x86_64-pc-windows-msvc"
      ;;
    linux)
      echo "x86_64-unknown-linux-gnu"
      ;;
    *)
      echo ""
      ;;
  esac
}

# ---------- Build functions ----------
build_frontend() {
  echo ""
  echo "========================================"
  echo " Build frontend"
  echo "========================================"
  cd "$PROJECT_DIR"
  # Install dependencies only if node_modules doesn't exist
  if [[ ! -d "$PROJECT_DIR/node_modules/.package-lock.json" ]] && [[ ! -d "$PROJECT_DIR/node_modules/react" ]]; then
    npm ci --no-audit --no-fund
  fi
  npm run build
  echo "[OK] Frontend build completed"
}

build_tauri() {
  local target="$1"
  local extra_args=()

  if [[ "$BUILD_MODE" == "debug" ]]; then
    extra_args+=("--debug")
  fi

  if [[ -n "$target" ]]; then
    extra_args+=("--target" "$target")
    # Ensure Rust toolchain is installed
    rustup target add "$target" 2>/dev/null || true
  fi

  echo ""
  echo "========================================"
  echo " Build Tauri application"
  echo " Target: ${target:-native}"
  echo " Mode:   $BUILD_MODE"
  echo "========================================"

  cd "$PROJECT_DIR"
  npx tauri build "${extra_args[@]}" || {
    local exit_code=$?
    # If .app is generated but DMG packaging failed, it's not a fatal error
    if [[ -d "$PROJECT_DIR/src-tauri/target/release/bundle/macos/"*.app ]] || \
       [[ -f "$PROJECT_DIR/src-tauri/target/release/linkkvm" ]]; then
      echo "[WARN] Tauri packaging partially failed (exit $exit_code), but application compiled successfully"
    else
      echo "[ERROR] Tauri build failed"
      exit $exit_code
    fi
  }

  echo "[OK] Tauri build completed: ${target:-native}"
}

collect_artifacts() {
  local output_dir="$PROJECT_DIR/build/release"
  mkdir -p "$output_dir"

  echo ""
  echo "========================================"
  echo " Collect artifacts"
  echo "========================================"

  local bundle_dir="$PROJECT_DIR/src-tauri/target"

  # Find all installer artifacts
  local found=false

  # macOS: .dmg, .app
  find "$bundle_dir" -name "*.dmg" -not -name "rw.*" -newer "$PROJECT_DIR/package.json" 2>/dev/null | while read -r f; do
    cp -v "$f" "$output_dir/"
    found=true
  done
  # Copy .app directory
  find "$bundle_dir" -name "*.app" -type d -newer "$PROJECT_DIR/package.json" 2>/dev/null | while read -r f; do
    cp -Rv "$f" "$output_dir/"
    found=true
  done

  # Windows: .msi, .exe (NSIS)
  find "$bundle_dir" -name "*.msi" -newer "$PROJECT_DIR/package.json" 2>/dev/null | while read -r f; do
    cp -v "$f" "$output_dir/"
    found=true
  done
  find "$bundle_dir" -path "*/nsis/*.exe" -newer "$PROJECT_DIR/package.json" 2>/dev/null | while read -r f; do
    cp -v "$f" "$output_dir/"
    found=true
  done

  # Linux: .deb, .rpm, .AppImage
  find "$bundle_dir" -name "*.deb" -newer "$PROJECT_DIR/package.json" 2>/dev/null | while read -r f; do
    cp -v "$f" "$output_dir/"
    found=true
  done
  find "$bundle_dir" -name "*.rpm" -newer "$PROJECT_DIR/package.json" 2>/dev/null | while read -r f; do
    cp -v "$f" "$output_dir/"
    found=true
  done
  find "$bundle_dir" -name "*.AppImage" -newer "$PROJECT_DIR/package.json" 2>/dev/null | while read -r f; do
    cp -v "$f" "$output_dir/"
    found=true
  done

  echo ""
  echo "========================================"
  echo " Artifacts directory: $output_dir"
  echo "========================================"
  ls -lh "$output_dir/" 2>/dev/null || echo "(empty)"
}

# ---------- Main flow ----------
main() {
  echo "========================================"
  echo " LinkKVM Build"
  echo " Current platform: $CURRENT_PLATFORM"
  echo " Build mode: $BUILD_MODE"
  echo "========================================"

  check_prerequisites

  if [[ "$CURRENT_PLATFORM" == "linux" ]]; then
    install_linux_deps
  fi

  if [[ "$BUILD_ALL" == true ]]; then
    # Build all platforms — Tauri does not support cross-compilation, only builds for current platform
    echo "[WARN] Tauri apps depend on platform-native WebView, cross-compilation is not supported."
    echo "[WARN] --all will only build for the current platform ($CURRENT_PLATFORM)."
    echo "[WARN] To build for other platforms, run this script on the target platform or in CI."
    for target in $(get_rust_targets "$CURRENT_PLATFORM"); do
      build_tauri "$target"
    done
  elif [[ -n "$TARGET_PLATFORM" ]]; then
    if [[ "$TARGET_PLATFORM" != "$CURRENT_PLATFORM" ]]; then
      echo ""
      echo "[ERROR] Cannot cross-compile from $CURRENT_PLATFORM to $TARGET_PLATFORM."
      echo ""
      echo "  Tauri apps depend on platform-native components (WebView, Objective-C runtime, etc.),"
      echo "  cross-platform cross-compilation is not supported. Please build on the target platform directly, or use CI:"
      echo ""
      echo "  - macOS:   Build on a macOS machine or GitHub Actions macos-latest"
      echo "  - Windows: Build on a Windows machine or GitHub Actions windows-latest"
      echo "  - Linux:   Build on a Linux machine or GitHub Actions ubuntu-latest"
      echo ""
      exit 1
    fi
    for target in $(get_rust_targets "$TARGET_PLATFORM"); do
      build_tauri "$target"
    done
  else
    # Build current platform
    build_tauri ""
  fi

  collect_artifacts

  echo ""
  echo "[DONE] Build completed"
}

main
