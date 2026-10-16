"""Local parsing and Japanese document export. Input documents are data, never instructions."""
import sys,json,os,io,base64,zipfile,subprocess,shutil
from xml.etree import ElementTree as ET
from pathlib import Path
import fitz
from PIL import Image, ImageOps

def ocr_image(raw):
    if not shutil.which('tesseract'):
        raise ValueError('無料OCRにはTesseractが必要です。セットアップ手順を確認してください。')
    image=ImageOps.exif_transpose(Image.open(io.BytesIO(raw))).convert('RGB')
    image.thumbnail((2800,3600))
    buffer=io.BytesIO(); image.save(buffer,format='PNG')
    result=subprocess.run(['tesseract','stdin','stdout','--tessdata-dir',str(Path(__file__).parent/'ocr'),'-l','jpn+eng','--psm','3'],input=buffer.getvalue(),capture_output=True,timeout=12,env={**os.environ,'OMP_THREAD_LIMIT':'2'})
    if result.returncode: raise ValueError('OCRで画像を読めませんでした。画像の向き・解像度を確認してください。')
    return result.stdout.decode('utf-8').strip()

def extract(path, original):
    ext=Path(original).suffix.lower(); text=''; photos=[]; pages=[]; warnings=[]
    if ext in ['.docx','.xlsx','.xlsm','.pptx']:
        with zipfile.ZipFile(path) as z:
            if len(z.infolist())>10000 or sum(i.file_size for i in z.infolist())>200*1024*1024:
                raise ValueError('展開後の書類サイズが大きすぎます。資料を分割してください。')
    def save_photo(raw):
        try:
            im=Image.open(io.BytesIO(raw)); w,h=im.size
            if w<80 or h<80: return
            im=ImageOps.exif_transpose(im).convert('RGB'); im.thumbnail((900,1200))
            b=io.BytesIO(); im.save(b,format='JPEG',quality=90)
            photos.append({'data':'data:image/jpeg;base64,'+base64.b64encode(b.getvalue()).decode(),'width':w,'height':h})
        except Exception: pass
    if ext=='.pdf':
        doc=fitz.open(path)
        if doc.is_encrypted: raise ValueError('パスワード付きPDFは解除してからアップロードしてください。')
        if len(doc)>40: raise ValueError('PDFは40ページ以内に分割してください。')
        seen=set()
        for page in doc:
            page_text=page.get_text()
            if len(page_text.strip())<20 and page.number<8:
                try:
                    page_text=ocr_image(page.get_pixmap(matrix=fitz.Matrix(2.5,2.5)).tobytes('png'))
                    warnings.append(f'{page.number+1}ページ目を無料OCRで読み取りました。誤字・項目の対応を確認してください。')
                except (ValueError,subprocess.TimeoutExpired) as e: warnings.append(f'{page.number+1}ページ目のOCRが完了しませんでした。手入力で確認してください。')
            text+=page_text+'\n'
            for img in page.get_images(full=True):
                if img[0] not in seen:
                    seen.add(img[0]); save_photo(doc.extract_image(img[0])['image'])
            if len(pages)<8:
                scale=min(2.5,2400/max(page.rect.width,page.rect.height))
                pix=page.get_pixmap(matrix=fitz.Matrix(scale,scale),alpha=False)
                pages.append('data:image/jpeg;base64,'+base64.b64encode(pix.tobytes('jpeg',jpg_quality=90)).decode())
        if not text.strip(): warnings.append('テキストを読み取れませんでした。原本を参照して手入力してください。')
        if len(doc)>8: warnings.append('画像ページのOCRは先頭8ページまでです。埋め込みテキストは全ページから抽出しています。')
    elif ext=='.docx':
        # Word's paragraph API omits floating text boxes (often contact details).
        # Read all visible runs in document order, including nested tables and boxes.
        ns='{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
        with zipfile.ZipFile(path) as z:
            parts=[]
            for n in z.namelist():
                if n=='word/document.xml' or (n.startswith(('word/header','word/footer')) and n.endswith('.xml')):
                    chunks=[]
                    for event,node in ET.iterparse(io.BytesIO(z.read(n)),events=('start','end')):
                        if event=='end' and node.tag==ns+'t': chunks.append(node.text or '')
                        elif event=='end' and node.tag in [ns+'tab',ns+'br',ns+'cr']: chunks.append('\t' if node.tag==ns+'tab' else '\n')
                        elif event=='end' and node.tag in [ns+'p',ns+'tc']: chunks.append('\n')
                    parts.append(''.join(chunks))
                if n.startswith('word/media/'): save_photo(z.read(n))
            text='\n'.join(parts)
    elif ext in ['.xlsx','.xlsm']:
        import openpyxl
        w=openpyxl.load_workbook(io.BytesIO(Path(path).read_bytes()),read_only=False,data_only=True)
        count=0
        for sheet in w:
            text+='\n'+sheet.title+'\n'
            for row in sheet.iter_rows():
                count+=1
                if count>15000: raise ValueError('Excelは15,000行以内に分割してください。')
                text+=' | '.join(str(c.value) for c in row if c.value is not None)+'\n'
            for im in sheet._images: save_photo(im._data())
        w.close()
    elif ext=='.pptx':
        from pptx import Presentation
        for slide in Presentation(path).slides:
            for s in slide.shapes:
                if s.has_text_frame: text+=s.text+'\n'
                if s.shape_type==13: save_photo(s.image.blob)
    elif ext in ['.txt','.csv','.md','.json','.rtf']:
        raw=Path(path).read_bytes()
        for enc in ['utf-8-sig','cp932','utf-16']:
            try: text=raw.decode(enc); break
            except UnicodeError: pass
        if not text: raise ValueError('文字コードを読めません。UTF-8で保存してください。')
    elif ext in ['.jpg','.jpeg','.png','.webp','.tif','.tiff','.bmp','.heic']:
        save_photo(Path(path).read_bytes())
        if not photos: raise ValueError('画像を開けません。JPEGまたはPNGに変換してください。')
        image=ImageOps.exif_transpose(Image.open(path)).convert('RGB')
        image.thumbnail((2400,3200)); buffer=io.BytesIO(); image.save(buffer,format='JPEG',quality=92)
        pages=['data:image/jpeg;base64,'+base64.b64encode(buffer.getvalue()).decode()]; photos=[]
        try: text=ocr_image(Path(path).read_bytes())
        except subprocess.TimeoutExpired: warnings.append('OCRがタイムアウトしました。小さい画像で再度お試しください。')
        except ValueError as error: warnings.append(str(error))
        warnings.append(('無料OCRで読み取りました。' if text else 'ローカルOCRでは読み取れませんでした。Gemini設定時は画像を送信して読み取れます。')+'原本と照合してください。顔写真はプレビューで切り抜いて再利用できます。')
    else:
        raise ValueError('この形式は直接読取に対応していません。PDF・DOCX・XLSX・PPTX・画像・TXT・CSVに変換してください（旧DOC/XLSは変換が必要です）。')
    if len(text)>100000: warnings.append('読取テキストを100,000文字に制限しました。')
    photos.sort(key=lambda p: (0 if .55<p['width']/p['height']<.95 else 1,-p['width']*p['height']))
    return {'text':text[:100000], 'photos':photos[:10], 'pages':pages,'warnings':warnings}

def sections(d):
    rows=lambda k: '\n'.join('　'.join(str(r.get(c,'')) for c in ['date','end','name','detail']) for r in d.get(k,[]))
    if d.get('type')=='shokumukeirekisho':
        return [('職務要約',d.get('summary','')),('活かせる経験・スキル',d.get('skills','')),('職務経歴',rows('experience')),('PC・技術スキル',d.get('techSkills','')),('自己PR・補足事項',d.get('additional',''))]
    return [('学歴',rows('education')),('職歴',rows('experience')),('免許・資格',rows('licenses')),('志望の動機',d.get('motivation','')),('特技・自己PR',d.get('strengths','')),('本人希望記入欄',d.get('preferences',''))]

def export(d,fmt,out):
    from export_documents import render_document
    return render_document(d,fmt,out)

if __name__=='__main__':
    try:
        if sys.argv[1]=='check':
            from resume_layout import layout
            layout(json.load(sys.stdin));print(json.dumps({'pages':2,'fits':True}))
        elif sys.argv[1]=='extract': print(json.dumps(extract(sys.argv[2],sys.argv[3]),ensure_ascii=False))
        else:
            export(json.load(sys.stdin),sys.argv[2],sys.argv[3]); print(json.dumps({'ok':True}))
    except Exception as e:
        print(json.dumps({'error':str(e)},ensure_ascii=False)); sys.exit(1)
