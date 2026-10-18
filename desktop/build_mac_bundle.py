"""Build the unsigned Mac app ZIP on any platform. No credentials or user data included."""
from pathlib import Path
import hashlib
import re
import plistlib
import stat
import zipfile

ROOT=Path(__file__).resolve().parents[1]
OUTPUT=ROOT/'downloads'/'MA-Group-Mac-App.zip'

def build():
    version=re.search(r"APP_VERSION='([^']+)'",(ROOT/'src/version.js').read_text()).group(1)
    assert plistlib.loads((ROOT/'M&A Group.app/Contents/Info.plist').read_bytes())['CFBundleShortVersionString']==version
    files={}
    for name in ['package.json','package-lock.json','requirements.txt','index.html','vite.config.js']:
        files['M&A Group.app/Contents/Resources/workspace/'+name]=ROOT/name
    for folder in ['src','server','desktop','dist']:
        for path in (ROOT/folder).rglob('*'):
            if path.is_file() and not path.is_symlink() and '__pycache__' not in path.parts:
                files['M&A Group.app/Contents/Resources/workspace/'+str(path.relative_to(ROOT))]=path
    for path in (ROOT/'M&A Group.app').rglob('*'):
        if path.is_file():files[str(path.relative_to(ROOT))]=path
    OUTPUT.parent.mkdir(exist_ok=True)
    with zipfile.ZipFile(OUTPUT,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=6) as archive:
        build=hashlib.sha256()
        for name,path in sorted(files.items()):
            build.update(name.encode());build.update(path.read_bytes())
            assert not any(part in ['.env','.data','.git','node_modules','.venv','.cache'] for part in Path(name).parts)
            info=zipfile.ZipInfo(name);info.create_system=3
            executable=name.endswith('/MacOS/launcher')
            info.external_attr=(stat.S_IFREG|(0o755 if executable else 0o644))<<16
            info.compress_type=zipfile.ZIP_DEFLATED;archive.writestr(info,path.read_bytes())
        archive.writestr('M&A Group.app/Contents/Resources/workspace/build-id.txt',build.hexdigest())
        archive.writestr('READ ME FIRST.txt',(ROOT/'START HERE - Mac.txt').read_bytes())
    with zipfile.ZipFile(OUTPUT) as archive:
        assert archive.testzip() is None
        info=archive.getinfo('M&A Group.app/Contents/MacOS/launcher')
        assert (info.external_attr>>16)&0o111
    print('Built:',OUTPUT,'bytes:',OUTPUT.stat().st_size)

if __name__=='__main__':build()
