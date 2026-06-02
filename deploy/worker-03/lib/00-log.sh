#!/usr/bin/env bash
# Logging helpers

_GREEN='\033[0;32m'
_YELLOW='\033[1;33m'
_RED='\033[0;31m'
_BLUE='\033[0;34m'
_CYAN='\033[0;36m'
_BOLD='\033[1m'
_NC='\033[0m'

log_step()  { echo -e "${_BLUE}${_BOLD}[STEP]${_NC}  $*"; }
log_info()  { echo -e "${_CYAN}[INFO]${_NC}  $*"; }
log_ok()    { echo -e "${_GREEN}[ OK ]${_NC}  $*"; }
log_warn()  { echo -e "${_YELLOW}[WARN]${_NC}  $*"; }
log_error() { echo -e "${_RED}[ERR ]${_NC}  $*" >&2; }
log_fail()  { echo -e "${_RED}[FAIL]${_NC}  $*" >&2; }

log_banner() {
  local msg="$*"
  local line
  line=$(printf '%*s' "${#msg}" '' | tr ' ' '-')
  echo -e "\n${_BOLD}${_BLUE}  $msg${_NC}"
  echo -e "${_BLUE}  $line${_NC}\n"
}
