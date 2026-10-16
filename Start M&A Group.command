#!/bin/bash
# Open this file in Terminal on your Mac. Secrets are never passed as arguments.
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
cd -- "$(dirname -- "$0")" || exit 1
if ! command -v python3 >/dev/null 2>&1; then
  echo 'Please install Python 3.12 or newer from https://www.python.org/downloads/macos/'
else
  python3 desktop/run_local.py
fi
printf '\nPress Return to close this window. '
read -r _magroup_close
