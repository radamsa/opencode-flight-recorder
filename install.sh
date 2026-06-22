#!/usr/bin/env bash
set -euo pipefail

PLUGIN_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_NAME="opencode-flight-recorder"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

info()  { echo -e "${GREEN}✓${NC} $1"; }
warn()  { echo -e "${YELLOW}⚠${NC} $1"; }
err()   { echo -e "${RED}✗${NC} $1"; }
header(){ echo -e "\n${BOLD}$1${NC}"; echo "──────────────────────────────"; }

cleanup() {
  local dir="$1"
  local tmp
  tmp="$(find "$dir" -maxdepth 1 -name "package.json.tmp.*" 2>/dev/null || true)"
  [ -n "$tmp" ] && rm -f "$tmp"
}

# --- usage ---
usage() {
  cat <<EOF
Usage: install.sh [options] [target-dir]

Install $PLUGIN_NAME as an OpenCode plugin.

Options:
  --global         Install globally (~/.config/opencode)
  --project        Install in the current directory (default if no target-dir given)
  --help           Show this help

If target-dir is provided, install there (project mode). If --global is set,
install in ~/.config/opencode. Otherwise, interactively choose.

Examples:
  ./install.sh                     # interactive
  ./install.sh --project           # install in current dir
  ./install.sh --global            # install globally
  ./install.sh /path/to/my-project # install in specific project
EOF
  exit 0
}

# --- JSON helpers (via node) ---
json_set_dep() {
  local pkg_json="$1" name="$2" path="$3"
  node -e "
    const fs = require('fs');
    const p = require('path');
    const pkg = JSON.parse(fs.readFileSync('$pkg_json', 'utf-8'));
    pkg.dependencies = pkg.dependencies || {};
    const rel = p.relative(p.dirname('$pkg_json'), '$path');
    pkg.dependencies['$name'] = 'file:' + (rel.startsWith('.') ? rel : './' + rel);
    fs.writeFileSync('$pkg_json', JSON.stringify(pkg, null, 2) + '\n');
  "
}

json_add_plugin() {
  local config_json="$1" plugin_name="$2"
  node -e "
    const fs = require('fs');
    const cfg = JSON.parse(fs.readFileSync('$config_json', 'utf-8'));
    cfg.plugin = cfg.plugin || [];
    if (!cfg.plugin.includes('$plugin_name')) {
      cfg.plugin.push('$plugin_name');
    }
    fs.writeFileSync('$config_json', JSON.stringify(cfg, null, 2) + '\n');
  "
}

# --- build ---
build_plugin() {
  header "Building plugin"
  cd "$PLUGIN_DIR"
  if [ ! -d "node_modules" ]; then
    npm install --silent 2>/dev/null || npm install
  fi
  npm run build 2>/dev/null || { err "Build failed. Run 'npm install && npm run build' in $PLUGIN_DIR"; exit 1; }
  info "Built $PLUGIN_NAME"
  cd - >/dev/null
}

# --- install config files ---
install_plugin() {
  local target="$1" mode="$2"

  local opencode_dir
  if [ "$mode" = "global" ]; then
    opencode_dir="$HOME/.config/opencode"
  else
    opencode_dir="$target/.opencode"
  fi

  mkdir -p "$opencode_dir"

  # --- package.json ---
  local pkg_json="$opencode_dir/package.json"
  header "Setting up $opencode_dir/package.json"

  if [ -f "$pkg_json" ]; then
    local has_it
    has_it=$(node -e "
      const pkg = JSON.parse(require('fs').readFileSync('$pkg_json','utf-8'));
      console.log(pkg.dependencies && pkg.dependencies['$PLUGIN_NAME'] ? 'yes' : 'no');
    ")
    if [ "$has_it" = "yes" ]; then
      info "$PLUGIN_NAME already in package.json dependencies"
    else
      json_set_dep "$pkg_json" "$PLUGIN_NAME" "$PLUGIN_DIR"
      info "Added $PLUGIN_NAME to package.json dependencies"
    fi
  else
    cat > "$pkg_json" <<EOF
{
  "dependencies": {
    "$PLUGIN_NAME": "file:$(node -e "console.log(require('path').relative('$opencode_dir', '$PLUGIN_DIR'))")"
  }
}
EOF
    info "Created $pkg_json with $PLUGIN_NAME dependency"
  fi

  # --- Bun install ---
  if command -v bun &>/dev/null; then
    header "Running bun install"
    (cd "$opencode_dir" && bun install 2>/dev/null) && info "Dependencies installed via bun" || warn "bun install failed — run it manually in $opencode_dir"
  else
    warn "bun not found. OpenCode will install dependencies on next startup."
  fi

  # --- opencode.json ---
  local config_json="$opencode_dir/opencode.json"
  header "Setting up $opencode_dir/opencode.json"

  if [ -f "$config_json" ]; then
    local has_plugin
    has_plugin=$(node -e "
      const cfg = JSON.parse(require('fs').readFileSync('$config_json','utf-8'));
      console.log(cfg.plugin && cfg.plugin.includes('$PLUGIN_NAME') ? 'yes' : 'no');
    ")
    if [ "$has_plugin" = "yes" ]; then
      info "$PLUGIN_NAME already in plugin list"
    else
      json_add_plugin "$config_json" "$PLUGIN_NAME"
      info "Added $PLUGIN_NAME to plugin array in opencode.json"
    fi
  else
    cat > "$config_json" <<EOF
{
  "\$schema": "https://opencode.ai/config.json",
  "plugin": ["$PLUGIN_NAME"]
}
EOF
    info "Created $config_json with $PLUGIN_NAME"
  fi
}

# --- main ---
main() {
  local target="" mode=""

  while [ $# -gt 0 ]; do
    case "$1" in
      --help|-h) usage ;;
      --global) mode="global"; shift ;;
      --project) mode="project"; shift ;;
      --*) err "Unknown option: $1"; usage ;;
      *) target="$1"; shift ;;
    esac
  done

  echo ""
  echo -e "${BOLD}OpenCode Flight Recorder — Installer${NC}"
  echo ""

  if [ -n "$target" ]; then
    mode="project"
  elif [ "$mode" = "global" ]; then
    target="$HOME"
  elif [ "$mode" = "project" ]; then
    target="$PWD"
  else
    header "Installation mode"
    echo "Where should $PLUGIN_NAME be installed?"
    echo "  1) In the current project  ($PWD)"
    echo "  2) Globally                (~/.config/opencode)"
    echo ""
    read -r -p "Choose [1/2]: " choice
    case "$choice" in
      2) mode="global"; target="$HOME" ;;
      *) mode="project"; target="$PWD" ;;
    esac
  fi

  echo ""
  if [ "$mode" = "global" ]; then
    info "Installing globally (~/.config/opencode)"
  else
    info "Installing for project: $target"
  fi

  build_plugin
  install_plugin "$target" "$mode"

  header "Installation complete"
  echo "  Plugin:   $PLUGIN_NAME"
  echo "  Location: $([ "$mode" = "global" ] && echo "~/.config/opencode" || echo "$target/.opencode")"
  echo ""
  echo "Start (or restart) OpenCode for the plugin to take effect."
  echo ""
}

main "$@"
