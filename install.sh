#!/usr/bin/env bash
set -euo pipefail

PLUGIN_DIR="$(cd "$(dirname "$0")" && pwd)"

GREEN='\033[0;32m'
BOLD='\033[1m'
NC='\033[0m'

info()  { echo -e "${GREEN}✓${NC} $1"; }
header(){ echo -e "\n${BOLD}$1${NC}"; echo "──────────────────────────────"; }

usage() {
  cat <<EOF
Usage: install.sh [options]

Install opencode-flight-recorder as an OpenCode plugin.

Options:
  --global    Install globally (~/.config/opencode)
  --project   Install in current project's .opencode/ (default)
  --help      Show this help

Examples:
  ./install.sh             # interactive
  ./install.sh --project   # install in current project
  ./install.sh --global    # install globally
EOF
  exit 0
}

build_plugin() {
  header "Building plugin"
  (
    cd "$PLUGIN_DIR"
    [ ! -d "node_modules" ] && npm install --silent 2>/dev/null || true
    npx tsc 2>/dev/null
  )
  info "Built opencode-flight-recorder"
}

install_plugin() {
  local flag="$1"
  header "Running: opencode plugin $PLUGIN_DIR $flag"
  opencode plugin "$PLUGIN_DIR" $flag
  info "Plugin installed"
}

main() {
  local mode=""  # "" = prompt, "project" = no prompt, "global" = --global

  while [ $# -gt 0 ]; do
    case "$1" in
      --help|-h) usage ;;
      --global) mode="global"; shift ;;
      --project) mode="project"; shift ;;
      *) echo "Unknown option: $1"; usage ;;
    esac
  done

  echo ""
  echo -e "${BOLD}OpenCode Flight Recorder — Installer${NC}"
  echo ""

  if [ -z "$mode" ]; then
    header "Installation mode"
    echo "Where should the plugin be installed?"
    echo "  1) Current project   ($PWD)"
    echo "  2) Globally          (~/.config/opencode)"
    echo ""
    read -r -p "Choose [1/2]: " choice
    [ "$choice" = "2" ] && mode="global" || mode="project"
  fi

  build_plugin

  local flag=""
  [ "$mode" = "global" ] && flag="--global"
  install_plugin "$flag"

  header "Installation complete"
  echo "  Plugin: opencode-flight-recorder"
  [ "$mode" = "global" ] && echo "  Scope:  global (~/.config/opencode)" || echo "  Scope:  project ($PWD/.opencode)"
  echo ""
  echo "Restart OpenCode for the plugin to take effect."
}

main "$@"
