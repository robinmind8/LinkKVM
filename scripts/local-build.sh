#!/usr/bin/env bash
# ============================================================================
# LinkKVM SSHFS Build Script
# ============================================================================
# Source code is mounted on a remote NAS via SSHFS, dependencies and build
# artifacts are stored locally.
#
# Strategy:
#   1. Create a "local view" directory on the local machine, with symlinks to remote source files
#   2. node_modules / build/dist / src-tauri/target remain as local real directories
#   3. Also create symlinks in the remote source directory pointing to local cache (for IDE indexing)
#   4. All heavy I/O operations (npm install, cargo build) use local disk
#
# Usage:
#   # Run from the remote source directory:
#   ./scripts/sync-build-local.sh              # Build release
#   ./scripts/sync-build-local.sh --debug      # Build debug
#   ./scripts/sync-build-local.sh --setup-only # Setup environment only, no build
#
# Cross-platform support: macOS / Linux / Windows (Git Bash / MSYS2)
# ============================================================================
set -euo pipefail

# ---------- Parse arguments ----------
BUILD_ARGS=()
SETUP_ONLY=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --setup-only)
      SETUP_ONLY=true
      shift
      ;;
    -h|--help)
      echo "Usage: $0 [options]"
      echo ""
      echo "Options:"
      echo "  --setup-only         Setup local build environment only, no build"
      echo "  --debug              Build in debug mode (passed to build.sh)"
      echo "  --target <platform>  Specify platform (passed to build.sh)"
      echo "  -h, --help           Show help"
      exit 0
      ;;
    *)
      BUILD_ARGS+=("$1")
      shift
      ;;
  esac
done

# ---------- Path setup ----------
# Get the directory where the script is located (resolve symlinks)
get_script_dir() {
  local source="${BASH_SOURCE[0]}"
  while [[ -L "$source" ]]; do
    local dir
    dir="$(cd -P "$(dirname "$source")" && pwd)"
    source="$(readlink "$source")"
    [[ "$source" != /* ]] && source="$dir/$source"
  done
  cd -P "$(dirname "$source")" && pwd
}

SCRIPT_DIR="$(get_script_dir)"
SRC_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"

# Local directory: suffixed with machine hostname, supports multiple build machines sharing the same NAS
HOSTNAME_TAG="$(hostname -s 2>/dev/null || echo "local")"
LOCAL_BASE="$HOME/work/linkkvm-build-${HOSTNAME_TAG}"
LOCAL_VIEW_DIR="$LOCAL_BASE/view"
LOCAL_CACHE_DIR="$LOCAL_BASE/cache"

echo "========================================"
echo " LinkKVM SSHFS Local Build"
echo "========================================"
echo " Source (SSHFS):    $SRC_DIR"
echo " Local view:        $LOCAL_VIEW_DIR"
echo " Local cache:       $LOCAL_CACHE_DIR"
echo " Host:              $HOSTNAME_TAG"
echo "========================================"

# ---------- Environment check ----------
check_prerequisites() {
  local missing=()
  command -v node  &>/dev/null || missing+=("Node.js")
  command -v npm   &>/dev/null || missing+=("npm")
  command -v cargo &>/dev/null || missing+=("Rust (cargo)")

  if [[ ${#missing[@]} -gt 0 ]]; then
    echo "[ERROR] Missing the following dependencies:"
    printf '  - %s\n' "${missing[@]}"
    exit 1
  fi
  echo "[OK] node $(node -v), npm $(npm -v), cargo $(cargo --version | cut -d' ' -f2)"
}

# ---------- Utility functions ----------
ensure_symlink() {
  local target_path="$1"   # The real path being pointed to
  local link_path="$2"     # The symlink path

  mkdir -p "$(dirname "$link_path")"

  # Already a correct symlink
  if [[ -L "$link_path" ]]; then
    local current
    current="$(readlink "$link_path")"
    if [[ "$current" == "$target_path" ]]; then
      return
    fi
    rm "$link_path"
  fi

  # Is a regular file/directory, backup
  if [[ -e "$link_path" ]]; then
    mv "$link_path" "${link_path}.bak.$(date +%Y%m%d%H%M%S)"
  fi

  ln -s "$target_path" "$link_path"
}

ensure_local_dir() {
  mkdir -p "$1"
}

resolve_lock_file() {
  # Prefer package-lock.json
  if [[ -f "$SRC_DIR/package-lock.json" ]]; then
    echo "$SRC_DIR/package-lock.json"
    return
  fi
  # Fall back to the latest backup
  local backup
  backup="$(ls -1t "$SRC_DIR"/package-lock.bak.*.json 2>/dev/null | head -1 || true)"
  if [[ -n "$backup" ]]; then
    echo "$backup"
  fi
}

# ---------- 1. Setup local build view ----------
setup_local_view() {
  echo ""
  echo "[1/4] Setting up local build view..."
  ensure_local_dir "$LOCAL_VIEW_DIR"
  ensure_local_dir "$LOCAL_CACHE_DIR"

  # Top-level config files → symlinks to remote
  local config_files=(
    .gitignore
    README.md
    index.html
    package.json
    postcss.config.js
    tailwind.config.js
    tsconfig.json
    tsconfig.node.json
    vite.config.ts
  )
  for f in "${config_files[@]}"; do
    [[ -e "$SRC_DIR/$f" ]] && ensure_symlink "$SRC_DIR/$f" "$LOCAL_VIEW_DIR/$f"
  done

  # package-lock.json
  local lock_file
  lock_file="$(resolve_lock_file)"
  if [[ -n "${lock_file:-}" ]]; then
    ensure_symlink "$lock_file" "$LOCAL_VIEW_DIR/package-lock.json"
  fi

  # src/ → symlink
  ensure_symlink "$SRC_DIR/src" "$LOCAL_VIEW_DIR/src"

  # scripts/ → symlink script files
  ensure_local_dir "$LOCAL_VIEW_DIR/scripts"
  for script_file in "$SRC_DIR"/scripts/*; do
    [[ -f "$script_file" ]] && ensure_symlink "$script_file" "$LOCAL_VIEW_DIR/scripts/$(basename "$script_file")"
  done

  # src-tauri/ → source symlinks + local target
  ensure_local_dir "$LOCAL_VIEW_DIR/src-tauri"
  local tauri_items=(Cargo.lock Cargo.toml build.rs capabilities gen icons src tauri.conf.json Info.plist)
  for item in "${tauri_items[@]}"; do
    [[ -e "$SRC_DIR/src-tauri/$item" ]] && ensure_symlink "$SRC_DIR/src-tauri/$item" "$LOCAL_VIEW_DIR/src-tauri/$item"
  done

  # Heavy I/O directories → local real directories
  ensure_local_dir "$LOCAL_VIEW_DIR/node_modules"
  ensure_local_dir "$LOCAL_VIEW_DIR/build/dist"
  ensure_local_dir "$LOCAL_VIEW_DIR/build/release"
  ensure_local_dir "$LOCAL_VIEW_DIR/src-tauri/target"

  echo "      Local view: $LOCAL_VIEW_DIR"
}

# ---------- 2. Create symlinks in remote source directory (IDE friendly) ----------
setup_remote_symlinks() {
  echo ""
  echo "[2/4] Setting up remote symlinks (IDE friendly)..."

  # node_modules → local cache
  ensure_local_dir "$LOCAL_CACHE_DIR/node_modules"
  ensure_symlink "$LOCAL_CACHE_DIR/node_modules" "$SRC_DIR/node_modules"

  # build/dist → local cache
  ensure_local_dir "$LOCAL_CACHE_DIR/build/dist"
  ensure_symlink "$LOCAL_CACHE_DIR/build/dist" "$SRC_DIR/build/dist"

  # src-tauri/target → local cache
  ensure_local_dir "$LOCAL_CACHE_DIR/src-tauri/target"
  ensure_symlink "$LOCAL_CACHE_DIR/src-tauri/target" "$SRC_DIR/src-tauri/target"

  # build/release → local view (build artifacts directly in view/build/release/)
  ensure_local_dir "$LOCAL_VIEW_DIR/build/release"
  ensure_symlink "$LOCAL_VIEW_DIR/build/release" "$SRC_DIR/build/release"

  echo "      Remote symlinks ready"
}

# ---------- 3. Install dependencies ----------
install_deps() {
  echo ""
  echo "[3/4] Installing JS dependencies..."
  cd "$LOCAL_VIEW_DIR"

  if [[ -e "$LOCAL_VIEW_DIR/package-lock.json" ]]; then
    npm ci --no-audit --no-fund
  else
    npm install --no-audit --no-fund
  fi

  # Sync node_modules to remote cache (so IDE can find modules via remote symlink)
  if [[ -d "$LOCAL_CACHE_DIR/node_modules" ]]; then
    # Remote node_modules symlink points to local-cache/node_modules
    # but local-view has its own node_modules, need to keep them consistent
    # Simplest approach: make remote symlink point directly to local-view's node_modules
    if [[ -L "$SRC_DIR/node_modules" ]]; then
      local current
      current="$(readlink "$SRC_DIR/node_modules")"
      if [[ "$current" != "$LOCAL_VIEW_DIR/node_modules" ]]; then
        rm "$SRC_DIR/node_modules"
        ln -s "$LOCAL_VIEW_DIR/node_modules" "$SRC_DIR/node_modules"
      fi
    fi
  fi

  echo "      Dependencies installed"
}

# ---------- 4. Build ----------
run_build() {
  echo ""
  echo "[4/4] Building..."
  cd "$LOCAL_VIEW_DIR"

  # Use build.sh (invoked via symlink to remote script, but PROJECT_DIR resolves to local view)
  bash "$LOCAL_VIEW_DIR/scripts/build.sh" "${BUILD_ARGS[@]}"
}

# ---------- Main flow ----------
main() {
  export PATH="$HOME/.cargo/bin:/opt/homebrew/bin:$PATH"

  check_prerequisites

  setup_local_view
  setup_remote_symlinks

  if [[ "$SETUP_ONLY" == true ]]; then
    echo ""
    echo "[DONE] Environment setup completed (build not executed)"
    echo "  Enter build directory: cd $LOCAL_VIEW_DIR"
    echo "  Install dependencies: npm ci"
    echo "  Build frontend:       npm run build"
    echo "  Build Tauri:          npx tauri build"
    return
  fi

  install_deps
  run_build

  # Sync artifacts to remote cache (build/release symlink)
  if [[ -d "$LOCAL_CACHE_DIR/build/release" ]]; then
    # Ensure remote build/release symlink points to local view's build/release
    if [[ -L "$SRC_DIR/build/release" ]]; then
      local current
      current="$(readlink "$SRC_DIR/build/release")"
      if [[ "$current" != "$LOCAL_VIEW_DIR/build/release" ]]; then
        rm "$SRC_DIR/build/release"
        ln -s "$LOCAL_VIEW_DIR/build/release" "$SRC_DIR/build/release"
      fi
    fi
  fi

  echo ""
  echo "========================================"
  echo " [DONE] Build completed"
  echo "========================================"
  echo " Artifacts directory: $LOCAL_VIEW_DIR/build/release/"
  echo " Remote visible:     $SRC_DIR/build/release/"
  echo ""
  ls -lh "$LOCAL_VIEW_DIR/build/release/" 2>/dev/null || echo " (artifacts directory is empty)"

  # Close old version, start new version
  local app_path="$LOCAL_VIEW_DIR/build/release/LinkKVM.app"
  if [[ -d "$app_path" ]]; then
    if pgrep -x linkkvm &>/dev/null; then
      echo ""
      echo "[*] Closing old version of LinkKVM..."
      pkill -x linkkvm 2>/dev/null || true
      # Wait for old process to fully exit
      for i in $(seq 1 10); do
        pgrep -x linkkvm &>/dev/null || break
        sleep 0.5
      done
    fi
    # Clear quarantine attribute to prevent macOS Gatekeeper from blocking
    xattr -cr "$app_path" 2>/dev/null || true
    echo "[*] Starting new version: $app_path"
    open "$app_path"
    # Verify if launch was successful
    local ok=false
    for i in $(seq 1 10); do
      sleep 1
      if pgrep -x linkkvm &>/dev/null; then
        ok=true
        break
      fi
    done
    if $ok; then
      echo "[OK] LinkKVM started"
    else
      echo "[WARN] LinkKVM process not detected, trying direct execution..."
      "$app_path/Contents/MacOS/linkkvm" &
      disown
      sleep 2
      if pgrep -x linkkvm &>/dev/null; then
        echo "[OK] LinkKVM started (direct execution)"
      else
        echo "[ERROR] LinkKVM launch failed, please open manually: open '$app_path'"
      fi
    fi
  fi
}

main