"""Extract portrait crops locally. Never return a résumé page as a portrait."""
import io,json,sys,subprocess,tempfile,base64,math
from pathlib import Path
from PIL import Image,ImageOps

def detect_faces(image):
    if sys.platform!='darwin':return []
    try:
        with tempfile.TemporaryDirectory(prefix='ma-portrait-') as folder:
            path=Path(folder)/'input.png';image.save(path,format='PNG')
            result=subprocess.run(['/usr/bin/osascript','-l','JavaScript',str(Path(__file__).with_name('mac_faces.js')),str(path)],capture_output=True,timeout=15)
            if result.returncode:return []
            response=json.loads(result.stdout.decode())
            if not isinstance(response,dict):return []
            faces=response.get('faces',[])
            if not isinstance(faces,list):return []
            return [f for f in faces if isinstance(f,dict) and all(isinstance(f.get(k),(int,float)) and math.isfinite(f[k]) for k in ['x','y','width','height']) and f.get('confidence',0)>=.6 and f['width']>0 and f['height']>0 and f['x']>=0 and f['y']>=0 and f['x']+f['width']<=1.001 and f['y']+f['height']<=1.001]
    except (OSError,ValueError,TypeError,subprocess.TimeoutExpired):return []

def portrait_candidates(raw,trusted_embedded=False):
    try:
        with Image.open(io.BytesIO(raw)) as opened:image=ImageOps.exif_transpose(opened).convert('RGB')
    except (OSError,ValueError):return []
    width,height=image.size
    if min(width,height)<80:return []
    # Avoid huge raster sizes in the native detector without losing small faces.
    image.thumbnail((2400,3200));width,height=image.size
    faces=[] if trusted_embedded else detect_faces(image)
    crops=[image] if trusted_embedded and .55<width/height<.95 else []
    # Most Japanese résumé photos are at the upper right. Keep only that person
    # for a document page; do not add other faces from incidental page images.
    faces.sort(key=lambda f:(-(f['x']+f['y']),-f['width']*f['height']))
    for face in faces[:1]:
        if .55<width/height<.95 and face['width']*face['height']>.06:
            crops.append(image);break
        fw,fh=face['width']*width,face['height']*height
        crop_w=max(fw*2.1,fh*1.5);crop_h=crop_w*4/3
        crop_w=min(crop_w,width,height*.75);crop_h=crop_w*4/3
        x=face['x']*width+fw/2-crop_w/2
        top=(1-face['y']-face['height'])*height
        y=top-fh*.4
        x=max(0,min(x,width-crop_w));y=max(0,min(y,height-crop_h))
        # A full scanned page has a tiny face. Return only its head/shoulders.
        crops.append(image.crop((round(x),round(y),round(x+crop_w),round(y+crop_h))))
    results=[]
    for crop in crops:
        crop.thumbnail((900,1200));buffer=io.BytesIO();crop.save(buffer,format='JPEG',quality=94)
        results.append({'data':'data:image/jpeg;base64,'+base64.b64encode(buffer.getvalue()).decode(),'width':crop.width,'height':crop.height,'portrait':True})
    return results
