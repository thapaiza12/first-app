#!/usr/bin/env python3
"""Copy shipped resources to writable Application Support, then launch without Terminal."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

SOURCE=Path(__file__).resolve().parents[1]
SUPPORT=Path.home()/'Library'/'Application Support'/'M&A Group'
TARGET=SUPPORT/'app'

def bootstrap():
    if sys.platform!='darwin':raise RuntimeError('This application is for macOS.')
    if sys.version_info<(3,12):raise RuntimeError('Please install Python 3.12 or newer, then reopen M&A Group.')
    TARGET.mkdir(parents=True,exist_ok=True)
    for source in SOURCE.rglob('*'):
        relative=source.relative_to(SOURCE)
        if any(part in ['.venv','node_modules','.data','.cache','__pycache__','.git'] for part in relative.parts):continue
        if source.is_symlink():continue
        if source.is_file():
            target=TARGET/relative
            target.parent.mkdir(parents=True,exist_ok=True)
            if not target.exists() or source.read_bytes()!=target.read_bytes():shutil.copy2(source,target)
    bundle=SOURCE.parents[2] if SOURCE.name=='workspace' else None
    if bundle and bundle.suffix=='.app':os.environ['MA_DESKTOP_APP_BUNDLE']=str(bundle)
    python=TARGET/'.venv'/'bin'/'python'
    executable=str(python) if python.exists() else sys.executable
    os.execve(executable,[executable,str(TARGET/'desktop'/'mac_app.py'),*sys.argv[1:]],os.environ.copy())

if __name__=='__main__':
    try:bootstrap()
    except Exception:
        subprocess.run(['/usr/bin/osascript','-e','display dialog "M&A Group could not prepare its local files. Check that Python 3.12 or newer is installed and that your Mac user can write to Library/Application Support." with title "M&A Group" buttons {"OK"}'],capture_output=True)
        sys.exit(1)
