#!/usr/bin/env python3
"""GUI entry point for macOS. Launches a detached local server; never opens Terminal."""
import fcntl
import json
import os
from pathlib import Path
import secrets
import shutil
import signal
import subprocess
import sys
import time
import urllib.request
import uuid

from run_local import ROOT, choose_port, setup, file_hash

SERVICE='M&A Group Gemini'
ACCOUNT='default'
SUPPORT=Path.home()/'Library'/'Application Support'/'M&A Group'
DATA=SUPPORT/'data'
STATE=DATA/'desktop-state.json'
LOG=Path.home()/'Library'/'Logs'/'M&A Group'/'app.log'
OPENER=urllib.request.build_opener(urllib.request.ProxyHandler({}))

def apple(script):
    return subprocess.run(['/usr/bin/osascript','-e',script],capture_output=True,text=True)

def dialog(message):
    # JSON quoting is also valid for these AppleScript string literals.
    apple('display dialog '+json.dumps(message)+' with title "M&A Group" buttons {"OK"} default button "OK"')

def notify(message):
    apple('display notification '+json.dumps(message)+' with title "M&A Group"')

def read_state():
    try:
        state=json.loads(STATE.read_text())
        port=state['port']
        if not isinstance(port,int) or not 1024<=port<=65535:return None
        if not isinstance(state['pid'],int) or state['pid']<=1:return None
        if not isinstance(state['instance'],str) or len(state['instance'])!=32:return None
        with OPENER.open(f'http://127.0.0.1:{port}/api/status',timeout=1) as r:
            status=json.load(r)
        if not secrets.compare_digest(str(status.get('desktopInstance','')),state['instance']):return None
        return state
    except (OSError,ValueError,KeyError,TypeError):return None

def stop_current():
    state=read_state()
    if not state:return False
    try:os.kill(state['pid'],signal.SIGTERM)
    except ProcessLookupError:pass
    for _ in range(30):
        if not read_state():
            STATE.unlink(missing_ok=True)
            return True
        time.sleep(.1)
    raise RuntimeError('The background app did not stop. Please restart your Mac before trying again.')

def open_browser(port):
    subprocess.run(['/usr/bin/open',f'http://localhost:{port}/ma-group-cv'],check=True)

def key_dialog():
    result=apple('''set answer to display dialog "Enter your Gemini API key once. It will be stored securely in your Mac login Keychain. Choose Use local tools to continue without Gemini." with title "M&A Group — Gemini" default answer "" with hidden answer buttons {"Cancel", "Use local tools", "Save key"} default button "Save key"
return (button returned of answer) & linefeed & (text returned of answer)''')
    if result.returncode:return None,None
    button,_,key=result.stdout.partition('\n')
    return button.strip(),key.strip()

def get_key(force=False,prompt_if_missing=True):
    # Explicit native macOS Keychain backend: no plaintext fallback.
    from keyring.backends.macOS import Keyring
    store=Keyring()
    try:saved=store.get_password(SERVICE,ACCOUNT)
    except Exception:
        dialog('Mac Keychain access was not available. You can enter a key for this session, or use local tools.')
        saved=None
    if saved and not force:return saved
    if os.environ.get('GEMINI_API_KEY') and not force:return os.environ['GEMINI_API_KEY']
    if not force and not prompt_if_missing:return None
    while True:
        button,key=key_dialog()
        if button is None:return saved
        if button=='Use local tools':
            try:
                if saved:store.delete_password(SERVICE,ACCOUNT)
            except Exception:
                dialog('The saved Keychain entry could not be removed. Use Keychain Access to remove M&A Group Gemini if you want to clear it permanently.')
            return None
        if not key:
            dialog('No key was entered. Paste the key into the box, or choose Use local tools.')
            continue
        try:store.set_password(SERVICE,ACCOUNT,key)
        except Exception:
            dialog('The key could not be saved in Keychain. It will work for this session only; you may be asked again next time.')
        return key

def get_groq_key(force=False):
    from keyring.backends.macOS import Keyring
    store=Keyring();service='M&A Group Groq'
    try:saved=store.get_password(service,ACCOUNT)
    except Exception:saved=None
    if not force:return saved or os.environ.get('GROQ_API_KEY') or None
    while True:
        result=apple('''set answer to display dialog "Enter your Groq API key. It will be stored in your Mac login Keychain. Create a key at console.groq.com/keys; do not paste it in chat." with title "M&A Group — Groq" default answer "" with hidden answer buttons {"Cancel", "Remove key", "Save key"} default button "Save key"
return (button returned of answer) & linefeed & (text returned of answer)''')
        if result.returncode:return saved
        button,_,key=result.stdout.partition('\n');button=button.strip();key=key.strip()
        if button=='Remove key':
            try:
                if saved:store.delete_password(service,ACCOUNT)
            except Exception:
                dialog('Could not remove the Groq Keychain entry. Remove M&A Group Groq in Keychain Access to clear it permanently.')
            return None
        if not key:
            dialog('Enter your Groq key or choose Cancel.')
            continue
        try:store.set_password(service,ACCOUNT,key)
        except Exception:dialog('Groq key could not be saved in Keychain. It will be used only for this session.')
        return key

def detach_server(node,python,env,port,instance,log):
    child_env=env.copy()
    child_env.update(NODE_ENV='development',PYTHON=str(python),DATA_DIR=str(DATA),PORT=str(port),MA_DESKTOP_INSTANCE=instance)
    proc=subprocess.Popen([node,'server/index.js'],cwd=ROOT,env=child_env,stdin=subprocess.DEVNULL,stdout=log,stderr=log,start_new_session=True,close_fds=True)
    return proc

def wait_ready(proc,port,instance):
    for _ in range(120):
        if proc.poll() is not None:raise RuntimeError('The app could not start. See the app log for details.')
        try:
            with OPENER.open(f'http://127.0.0.1:{port}/api/status',timeout=1) as r:status=json.load(r)
            if status.get('desktopInstance')==instance:return
        except (OSError,ValueError):pass
        time.sleep(.25)
    raise RuntimeError('The app took too long to start. Please try again.')

def main():
    if sys.platform!='darwin':raise RuntimeError('This icon is for macOS.')
    LOG.parent.mkdir(parents=True,exist_ok=True)
    # Child installers inherit a log file, never a Terminal window.
    log=open(LOG,'a',buffering=1)
    os.dup2(log.fileno(),1);os.dup2(log.fileno(),2)
    DATA.mkdir(mode=0o700,parents=True,exist_ok=True)
    inherited=os.environ.pop('MA_GUI_LOCK_FD',None)
    lock_file=os.fdopen(int(inherited),'a') if inherited else open(DATA/'desktop.lock','a')
    with lock_file as lock:
        try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:
            notify('M&A Group is already starting. Please wait a moment.')
            return
        if '--stop' in sys.argv:
            stopped=stop_current()
            dialog('M&A Group has stopped. Your saved documents are kept.' if stopped else 'M&A Group is not currently running.')
            return
        force_gemini='--settings' in sys.argv
        force_groq='--groq-settings' in sys.argv
        force=force_gemini or force_groq
        running=read_state()
        build_file=ROOT/'build-id.txt'
        build_id=build_file.read_text().strip() if build_file.exists() else 'source-checkout'
        if running and running.get('buildId')!=build_id:
            stop_current();running=None
        if running and not force:
            open_browser(running['port'])
            return
        if sys.version_info<(3,12):raise RuntimeError('Please install Python 3.12 or newer, then open M&A Group again.')
        node,npm=shutil.which('node'),shutil.which('npm')
        if not node or not npm:raise RuntimeError('Please install Node.js 24 or newer, then open M&A Group again.')
        version=subprocess.check_output([node,'--version'],text=True).strip().lstrip('v')
        if int(version.split('.')[0])<24:raise RuntimeError('Please update Node.js to version 24 or newer.')
        marker=ROOT/'.venv'/'.magroup-mac-requirements'
        if not marker.exists():
            dialog('First-time setup will install the app components. Click OK to begin. This may take several minutes; your browser will open automatically when ready. No Terminal window is needed.')
        notify('Preparing M&A Group. Your browser will open when ready.')
        python=setup(node,npm)
        requirements=ROOT/'desktop'/'requirements-mac.txt'
        marker=ROOT/'.venv'/'.magroup-mac-requirements'
        fingerprint=file_hash(requirements)
        if not marker.exists() or marker.read_text()!=fingerprint:
            subprocess.run([str(python),'-m','pip','install','--cache-dir',str(ROOT/'.cache'/'pip'),'-r',str(requirements)],cwd=ROOT,check=True)
            marker.write_text(fingerprint)
        if Path(sys.prefix).resolve()!=(ROOT/'.venv').resolve():
            # Preserve the process lock across re-exec; duplicate starts stay serialized.
            os.set_inheritable(lock.fileno(),True)
            env=os.environ.copy();env['MA_GUI_LOCK_FD']=str(lock.fileno())
            # Release the Python-managed context only by replacing this process.
            os.execve(str(python),[str(python),str(Path(__file__).resolve()),'--prepared',*(['--settings'] if force_gemini else []),*(['--groq-settings'] if force_groq else [])],env)
        groq_key=get_groq_key(force_groq)
        key=get_key(force_gemini,prompt_if_missing=not (force_groq or groq_key))
        if running:stop_current()
        env=os.environ.copy();env.pop('GEMINI_API_KEY',None);env.pop('GROQ_API_KEY',None);env.pop('MA_GUI_LOCK_FD',None)
        if key:env['GEMINI_API_KEY']=key
        if groq_key:env['GROQ_API_KEY']=groq_key
        port=choose_port(3001);instance=uuid.uuid4().hex
        proc=detach_server(node,python,env,port,instance,log)
        try:
            wait_ready(proc,port,instance)
        except Exception:
            proc.terminate()
            raise
        state={'pid':proc.pid,'port':port,'instance':instance,'buildId':build_id}
        temporary=STATE.with_suffix('.tmp')
        temporary.write_text(json.dumps(state));temporary.chmod(0o600);temporary.replace(STATE)
        open_browser(port)
        # The launcher exits. The detached server keeps running until Stop or logout/restart.

if __name__=='__main__':
    try:
        main()
    except Exception:
        # Avoid logging exceptions that could include credentials from third-party libraries.
        dialog('M&A Group could not start. A dependency, permissions, or setup step failed. You can open the setup log to see progress. The log is in Library/Logs/M&A Group/app.log.')
        sys.exit(1)
