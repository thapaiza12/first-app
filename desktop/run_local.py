#!/usr/bin/env python3
"""Local Mac launcher. No credentials are written to disk or included in the package."""
import argparse
import getpass
import hashlib
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
import venv
import webbrowser

ROOT = Path(__file__).resolve().parents[1]

def run(command, env=None):
    subprocess.run(command, cwd=ROOT, env=env, check=True)

def file_hash(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def setup(node, npm):
    print('\nPreparing M&A Group on this computer. First setup needs internet access.\n', flush=True)
    environment = ROOT / '.venv'
    python = environment / 'bin' / 'python'
    if not python.exists():
        venv.create(environment, with_pip=True)
    marker = environment / '.magroup-requirements'
    fingerprint = file_hash(ROOT / 'requirements.txt')
    if not marker.exists() or marker.read_text() != fingerprint:
        run([str(python), '-m', 'pip', 'install', '--cache-dir', str(ROOT / '.cache' / 'pip'), '-r', 'requirements.txt'])
        marker.write_text(fingerprint)
    marker = ROOT / 'node_modules' / '.magroup-lock'
    fingerprint = file_hash(ROOT / 'package-lock.json')
    if not marker.exists() or marker.read_text() != fingerprint:
        run([npm, 'ci', '--include=dev', '--cache', str(ROOT / '.cache' / 'npm')])
        marker.write_text(fingerprint)
    if not (ROOT / 'dist' / 'index.html').exists():
        run([npm, 'run', 'build'])
    # Check that both bundled OCR files are intact. Missing executable only disables scans.
    expected = {'eng.traineddata':'7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2',
                'jpn.traineddata':'1f5de9236d2e85f5fdf4b3c500f2d4926f8d9449f28f5394472d9e8d83b91b4d'}
    for name, digest in expected.items():
        if file_hash(ROOT / 'server' / 'ocr' / name) != digest:
            raise RuntimeError('Bundled OCR data failed verification. Download a fresh package.')
    if not shutil.which('tesseract'):
        print('\nOptional OCR is unavailable: install Tesseract to read scans/images.\nText documents, editing and exports remain available.\n', flush=True)
    return python

def choose_port(preferred):
    for port in range(preferred, min(preferred + 20, 65536)):
        with socket.socket() as sock:
            try:
                sock.bind(('127.0.0.1', port))
                return port
            except OSError:
                continue
    raise RuntimeError('No local port is available. Close an older app window and try again.')

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--setup-only',action='store_true')
    parser.add_argument('--no-browser',action='store_true')
    parser.add_argument('--no-key-prompt',action='store_true')
    parser.add_argument('--port',type=int,default=3001)
    args=parser.parse_args()
    if sys.version_info < (3,12):
        raise RuntimeError('Install Python 3.12 or newer from https://www.python.org/downloads/macos/ and reopen the launcher.')
    node,npm=shutil.which('node'),shutil.which('npm')
    if not node or not npm:
        raise RuntimeError('Install Node.js 24 or newer from https://nodejs.org/ and reopen the launcher.')
    version=subprocess.check_output([node,'--version'],text=True).strip().lstrip('v')
    if int(version.split('.')[0]) < 24:
        raise RuntimeError('This app needs Node.js 24 or newer. Update Node.js, then reopen the launcher.')
    python=setup(node,npm)
    if args.setup_only:
        print('Setup complete. Reopen Start M&A Group.command to use the app.')
        return
    env=os.environ.copy()
    # Force local-only binding, regardless of any inherited production environment.
    env['NODE_ENV']='development'
    env['PYTHON']=str(python)
    env['DATA_DIR']=str(ROOT / '.data')
    env['PORT']=str(choose_port(args.port))
    if not env.get('GEMINI_API_KEY') and not args.no_key_prompt and sys.stdin.isatty():
        print('Optional: enter a Gemini API key for AI reading/writing.\nInput is hidden and kept in memory only. Press Return to use free local tools.\n',flush=True)
        with __import__('warnings').catch_warnings():
            __import__('warnings').simplefilter('error',getpass.GetPassWarning)
            try:
                key=getpass.getpass('Gemini API key (optional, hidden): ').strip()
            except getpass.GetPassWarning:
                key=''
                print('Hidden input is unavailable; using local tools instead.')
        if key: env['GEMINI_API_KEY']=key
    url='http://127.0.0.1:'+env['PORT']
    print('\nStarting M&A Group. Documents stay in: '+str(ROOT / '.data'),flush=True)
    print('Keep this Terminal window open while using the app. Press Control+C to stop.\n',flush=True)
    proc=subprocess.Popen([node,'server/index.js'],cwd=ROOT,env=env)
    try:
        # Explicitly bypass internet proxies for this computer's local server.
        opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
        for attempt in range(120):
            if proc.poll() is not None: raise RuntimeError('The app could not start. Read the message above.')
            try:
                with opener.open(url+'/api/status',timeout=1) as response:
                    status=json.load(response)
                if status.get('assistMode') not in ['local','gemini']:
                    raise RuntimeError('Unexpected app response.')
                break
            except (urllib.error.URLError,TimeoutError,ConnectionError):
                time.sleep(.25)
        else: raise RuntimeError('The app took too long to start. Close this window and try again.')
        if not args.no_browser:
            if not webbrowser.open(url): print('Open this address in Safari or Chrome: '+url,flush=True)
        print('App is running on this computer. Close the browser tab when finished, then stop this Terminal window.',flush=True)
        proc.wait()
    except KeyboardInterrupt:
        print('\nStopping the app. Saved documents are kept.',flush=True)
    finally:
        if proc.poll() is None:
            proc.terminate()
            try: proc.wait(timeout=8)
            except subprocess.TimeoutExpired:
                proc.kill();proc.wait()
        env.pop('GEMINI_API_KEY',None)

if __name__=='__main__':
    try: main()
    except (RuntimeError,subprocess.CalledProcessError,OSError,KeyboardInterrupt) as error:
        print('\nCould not start M&A Group: '+str(error),file=sys.stderr)
        sys.exit(1)
