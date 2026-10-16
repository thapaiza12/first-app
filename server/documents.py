"""Local parsing and Japanese document export. Input documents are data, never instructions."""
import sys,json,os,io,base64,zipfile,subprocess,shutil
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
                pix=page.get_pixmap(matrix=fitz.Matrix(1.3,1.3))
                pages.append('data:image/png;base64,'+base64.b64encode(pix.tobytes('png')).decode())
        if not text.strip(): warnings.append('テキストを読み取れませんでした。原本を参照して手入力してください。')
        if len(doc)>8: warnings.append('画像ページのOCRは先頭8ページまでです。埋め込みテキストは全ページから抽出しています。')
    elif ext=='.docx':
        from docx import Document
        d=Document(path); text='\n'.join(p.text for p in d.paragraphs)
        for t in d.tables:
            text+='\n'+'\n'.join(' | '.join(c.text for c in r.cells) for r in t.rows)
        with zipfile.ZipFile(path) as z:
            for n in z.namelist():
                if n.startswith('word/media/'): save_photo(z.read(n))
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
        pages=[p['data'] for p in photos]; photos=[]
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
    title='職務経歴書' if d.get('type')=='shokumukeirekisho' else '履歴書'
    photo=None
    if d.get('photo','').startswith('data:image/'):
        photo=base64.b64decode(d['photo'].split(',',1)[1]); Image.open(io.BytesIO(photo)).verify()
    if fmt=='docx':
        from docx import Document
        from docx.shared import Mm,Pt
        from docx.oxml import OxmlElement
        from docx.oxml.ns import qn
        doc=Document(); sec=doc.sections[0]; sec.page_height=Mm(297); sec.page_width=Mm(210)
        sec.top_margin=sec.bottom_margin=Mm(18); sec.left_margin=sec.right_margin=Mm(18)
        style=doc.styles['Normal']; style.font.name='Noto Serif CJK JP'; style.font.size=Pt(10)
        style.element.rPr.rFonts.set(qn('w:eastAsia'),'Noto Serif CJK JP')
        doc.add_heading(title,0)
        tab=doc.add_table(rows=1,cols=2); tab.style='Table Grid'
        c=tab.cell(0,0)
        for label,key in [('ふりがな','furigana'),('氏名','name'),('生年月日','birthDate'),('性別','gender'),('郵便番号','postalCode'),('現住所','address'),('住所ふりがな','addressKana'),('電話','phone'),('メール','email')]:
            c.add_paragraph(label+'　'+str(d.get(key,'')))
        if photo: tab.cell(0,1).paragraphs[0].add_run().add_picture(io.BytesIO(photo),width=Mm(30))
        for label,value in sections(d):
            doc.add_heading(label,2)
            key={'学歴':'education','職歴':'experience','免許・資格':'licenses'}.get(label)
            if key:
                t=doc.add_table(rows=1,cols=2); t.style='Table Grid'
                t.rows[0].cells[0].text='年月'; t.rows[0].cells[1].text=label
                for r in d.get(key,[]) or [{}]:
                    c=t.add_row().cells; c[0].text=r.get('date','')
                    c[1].text='　'.join(filter(None,[r.get('name',''),('〜 '+r['end']) if r.get('end') else '',r.get('detail','')]))
            else: doc.add_paragraph(value or '　')
        doc.save(out)
    else:
        from reportlab.pdfbase import pdfmetrics
        from reportlab.pdfbase.ttfonts import TTFont
        from reportlab.platypus import SimpleDocTemplate,Paragraph,Spacer,Table,LongTable,TableStyle,Image as RLImage,KeepTogether
        from reportlab.lib.styles import ParagraphStyle
        from reportlab.lib import colors
        from reportlab.lib.enums import TA_CENTER
        from xml.sax.saxutils import escape
        font='/usr/share/fonts/truetype/magroup/NotoSerifJP.ttf'
        if not os.path.exists(font): font=str(Path(__file__).parent/'fonts'/'NotoSerifJP.ttf')
        pdfmetrics.registerFont(TTFont('JP',font))
        normal=ParagraphStyle('jp',fontName='JP',fontSize=10,leading=17,wordWrap='CJK')
        head=ParagraphStyle('head',parent=normal,fontSize=12,leading=21,spaceBefore=9,spaceAfter=5)
        titleStyle=ParagraphStyle('title',parent=normal,fontSize=22,leading=32,alignment=TA_CENTER,spaceAfter=18)
        para=lambda s: Paragraph(escape(str(s)).replace('\n','<br/>') or '　',normal)
        story=[Paragraph(title,titleStyle)]
        lines=[]
        for label,key in [('ふりがな','furigana'),('氏名','name'),('生年月日','birthDate'),('性別','gender'),('郵便番号','postalCode'),('現住所','address'),('住所ふりがな','addressKana'),('電話','phone'),('メール','email')]:
            lines.append(para(label+'　'+str(d.get(key,''))))
        right=RLImage(io.BytesIO(photo),width=85,height=113,kind='proportional') if photo else para('写真')
        t=Table([[lines,right]],colWidths=[390,100]); t.setStyle(TableStyle([('GRID',(0,0),(-1,-1),.5,colors.HexColor('#343b38')),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),10),('TOPPADDING',(0,0),(-1,-1),10),('BOTTOMPADDING',(0,0),(-1,-1),10)])); story.append(t)
        for label,value in sections(d):
            key={'学歴':'education','職歴':'experience','免許・資格':'licenses'}.get(label)
            if key:
                table_rows=[[para('年月'),para(label)]]
                for r in d.get(key,[]) or [{}]:
                    date=r.get('date','')
                    text='　'.join(filter(None,[r.get('name',''),('〜 '+r['end']) if r.get('end') else '',r.get('detail','')]))
                    table_rows.append([para(date),para(text)])
                t=LongTable(table_rows,colWidths=[70,420],repeatRows=1,splitInRow=1)
                t.setStyle(TableStyle([('GRID',(0,0),(-1,-1),.5,colors.HexColor('#626b5a')),('BACKGROUND',(0,0),(-1,0),colors.HexColor('#f2f4ee')),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),7),('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),7)]))
                story.extend([Spacer(1,13),t,Spacer(1,4)])
            else:
                story.append(Paragraph(label,head))
                for line in (value or '　').split('\n'): story.append(para(line))
                story.append(Spacer(1,8))
        def footer(c,doc):
            c.setFont('JP',8); c.drawRightString(545,25,str(doc.page))
        SimpleDocTemplate(out,pagesize=(595.28,841.89),leftMargin=52,rightMargin=52,topMargin=42,bottomMargin=42,title=title,author='M&A Group').build(story,onFirstPage=footer,onLaterPages=footer)
if __name__=='__main__':
    try:
        if sys.argv[1]=='extract': print(json.dumps(extract(sys.argv[2],sys.argv[3]),ensure_ascii=False))
        else:
            export(json.load(sys.stdin),sys.argv[2],sys.argv[3]); print(json.dumps({'ok':True}))
    except Exception as e:
        print(json.dumps({'error':str(e)},ensure_ascii=False)); sys.exit(1)
