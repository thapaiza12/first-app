import importlib
import json
import os
from pathlib import Path
import plistlib
import signal
import subprocess
import sys
import tempfile
import time
import types
import unittest
from unittest.mock import Mock,patch
import urllib.request

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'desktop'))
app=importlib.import_module('mac_app')

class MacDesktopTests(unittest.TestCase):
    def keychain(self,store):
        module=types.ModuleType('keyring.backends.macOS');module.Keyring=lambda:store
        return patch.dict(sys.modules,{'keyring':types.ModuleType('keyring'),'keyring.backends':types.ModuleType('keyring.backends'),'keyring.backends.macOS':module})

    def test_launcher_opens_the_friendly_app_address(self):
        with patch.object(app.subprocess,'run') as run:
            app.open_browser(3002)
        run.assert_called_once_with(['/usr/bin/open','http://localhost:3002/ma-group-cv'],check=True)

    def test_saved_key_is_reused_without_a_prompt(self):
        store=Mock();store.get_password.return_value='test-only-placeholder'
        with self.keychain(store),patch.object(app,'key_dialog') as prompt:
            self.assertEqual(app.get_key(),'test-only-placeholder');prompt.assert_not_called()

    def test_new_key_uses_native_keychain_and_local_mode_can_clear_it(self):
        store=Mock();store.get_password.return_value=None
        with self.keychain(store),patch.dict(os.environ,{'GEMINI_API_KEY':''}),patch.object(app,'key_dialog',return_value=('Save key','test-only-placeholder')):
            self.assertEqual(app.get_key(),'test-only-placeholder')
            store.set_password.assert_called_once_with(app.SERVICE,app.ACCOUNT,'test-only-placeholder')
        store.get_password.return_value='test-only-placeholder'
        with self.keychain(store),patch.object(app,'key_dialog',return_value=('Use local tools','')):
            self.assertIsNone(app.get_key(force=True));store.delete_password.assert_called_once()

    def test_groq_key_uses_its_own_keychain_service_and_no_unsolicited_prompt(self):
        store=Mock();store.get_password.return_value=None
        with self.keychain(store),patch.dict(os.environ,{'GROQ_API_KEY':''}),patch.object(app,'apple') as prompt:
            self.assertIsNone(app.get_groq_key());prompt.assert_not_called()
        response=Mock(returncode=0,stdout='Save key\ntest-only-groq-placeholder\n')
        with self.keychain(store),patch.object(app,'apple',return_value=response):
            self.assertEqual(app.get_groq_key(force=True),'test-only-groq-placeholder')
            store.set_password.assert_called_once_with('M&A Group Groq',app.ACCOUNT,'test-only-groq-placeholder')
        store.get_password.return_value='saved-groq-placeholder'
        with self.keychain(store),patch.object(app,'apple') as prompt:
            self.assertEqual(app.get_groq_key(),'saved-groq-placeholder');prompt.assert_not_called()

    def test_app_bundle_has_an_executable_and_does_not_launch_terminal(self):
        info=plistlib.loads((ROOT/'M&A Group.app/Contents/Info.plist').read_bytes())
        launcher=ROOT/'M&A Group.app/Contents/MacOS'/info['CFBundleExecutable']
        self.assertTrue(launcher.stat().st_mode&0o111)
        self.assertNotIn('Terminal',launcher.read_text())
        self.assertIn('mac_bootstrap.py',launcher.read_text())
        self.assertTrue((ROOT/'M&A Group.app/Contents/Resources/AppIcon.icns').is_file())

    def test_state_identity_prevents_stopping_a_different_app(self):
        with tempfile.TemporaryDirectory() as d:
            state=Path(d)/'state.json';state.write_text(json.dumps({'pid':9999,'port':3094,'instance':'a'*32}))
            response=Mock();response.__enter__=lambda _:response;response.__exit__=lambda *args:None
            response.read.return_value=json.dumps({'desktopInstance':'b'*32}).encode()
            with patch.object(app,'STATE',state),patch.object(app.OPENER,'open',return_value=response),patch('mac_app.os.kill') as kill:
                self.assertFalse(app.stop_current());kill.assert_not_called()

    def test_server_survives_launcher_exit_and_reuses_the_same_instance(self):
        with tempfile.TemporaryDirectory(prefix='ma background test ') as d:
            directory=Path(d);data=directory/'data';data.mkdir();info=directory/'info.json'
            script='''import json,os,sys,uuid
from pathlib import Path
sys.path.insert(0,sys.argv[1]);import mac_app as app
app.DATA=Path(sys.argv[2]);port=app.choose_port(3094);instance=uuid.uuid4().hex
env=os.environ.copy();env.pop('GEMINI_API_KEY',None)
with open(sys.argv[3],'a') as log:
 proc=app.detach_server(sys.argv[4],sys.argv[5],env,port,instance,log)
 app.wait_ready(proc,port,instance)
 Path(sys.argv[6]).write_text(json.dumps({'pid':proc.pid,'port':port,'instance':instance}))
'''
            node=__import__('shutil').which('node')
            result=subprocess.run([sys.executable,'-c',script,str(ROOT/'desktop'),str(data),str(directory/'log'),node,str(ROOT/'.venv/bin/python'),str(info)],cwd=ROOT,capture_output=True,text=True,timeout=40)
            self.assertEqual(result.returncode,0,result.stderr)
            state=json.loads(info.read_text())
            opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
            try:
                # The launcher above is gone. Its server must still answer.
                with opener.open(f"http://127.0.0.1:{state['port']}/api/status",timeout=3) as r:status=json.load(r)
                self.assertEqual(status['desktopInstance'],state['instance']);self.assertTrue(status['desktopMode'])
                statefile=data/'desktop-state.json';statefile.write_text(json.dumps(state))
                with patch.object(app,'STATE',statefile):
                    self.assertEqual(app.read_state()['pid'],state['pid'])
                    self.assertTrue(app.stop_current())
            finally:
                try:os.kill(state['pid'],signal.SIGTERM)
                except ProcessLookupError:pass

if __name__=='__main__':unittest.main()
