"""Measured, fixed two-sheet résumé layout shared by PDF and editable Word output.
Content that cannot fit at a readable size is rejected, never clipped or put on page 3.
"""
from pathlib import Path
import base64,io,re
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from export_documents import asof,jpdate,birth,TITLE,MOTIVATION,PREFERENCES

PAGE_W,PAGE_H=595.28,841.89
X,W=42,511.28
HEADING_SIZE,CONTENT_SIZE=13,12
GRID_HEADER=28
BOTTOM=764

def init_font():
    if 'JP' not in pdfmetrics.getRegisteredFontNames():pdfmetrics.registerFont(TTFont('JP',str(Path(__file__).parent/'fonts/NotoSerifJP.ttf')))

def lines(value,size,width):
    init_font();result=[]
    for paragraph in str(value or '').split('\n'):
        current=''
        # Keep ordinary Latin words together; Japanese still wraps by character.
        tokens=re.findall(r"[A-Za-z0-9]+(?:[’'._@/+\-][A-Za-z0-9]+)*|[ \t]+|.",paragraph)
        for token in tokens:
            if current and pdfmetrics.stringWidth(current+token,'JP',size)>width:
                result.append(current);current=''
            if pdfmetrics.stringWidth(token,'JP',size)>width:
                for char in token:
                    if current and pdfmetrics.stringWidth(current+char,'JP',size)>width:
                        result.append(current);current=''
                    current+=char
            else:current+=token
        result.append(current)
    return result or ['']

def fit(value,width,height,label,base=CONTENT_SIZE,minimum=CONTENT_SIZE):
    for size in [base-i*.5 for i in range(int((base-minimum)*2)+1)]:
        wrapped=lines(value,size,width*.96)
        if len(wrapped)*size*1.35<=height-8:
            return {'text':str(value or ''),'lines':wrapped,'size':size,'leading':size*1.35}
    raise ValueError(f'履歴書を2ページに収められません。「{label}」の内容を短くしてください。内容は保存されたままです。')

def normalize_jobs(rows):
    result=[]
    for original in rows:
        r=dict(original);m=re.match(r'^(.*?)[\s　]*(入社|退社|退職)\s*$',r.get('name',''));base=m[1].strip() if m else r.get('name','')
        if m and m[2] in ['退社','退職']:
            if result and result[-1].get('name')==base and not result[-1].get('end'):
                result[-1]['end']=r.get('date','');result[-1]['current']=False;continue
            r.update(date='',end=r.get('date',''),current=False)
        r['name']=base;result.append(r)
    return result

def employment_events(rows):
    out=[]
    for r in normalize_jobs(rows):
        out.append({'date':r.get('date',''),'name':r.get('name','')+'　入社'})
        out.append({'date':'' if r.get('current') else r.get('end',''),'name':'現在に至る' if r.get('current') else r.get('name','')+'　退社'})
    return out

def education_events(rows):
    out=[]
    event=re.compile(r'(入学|卒業|修了|中退|退学|在学中)\s*$')
    for original in rows:
        r=dict(original);name=r.get('name','').strip();detail=r.get('detail','').strip()
        parts=[p for p in [*name.splitlines(),*detail.splitlines()] if p]
        explicit=list(dict.fromkeys(p for p in parts if event.search(p)))
        if explicit:
            extra=[p for p in parts if not event.search(p) and not any(e.startswith(p) for e in explicit)]
            if len(explicit)==1 and re.search(r'入学\s*$',explicit[0]) and r.get('end'):
                base=re.sub(r'[\s　]*入学\s*$','',explicit[0])
                out.extend([{**r,'name':explicit[0],'end':'','detail':''},{**r,'name':base+'　'+r.get('completion','卒業'),'date':r['end'],'end':'','detail':'\n'.join(extra)}]);continue
            for i,p in enumerate(explicit):out.append({**r,'date':r.get('end','') if i else r.get('date',''),'end':'','name':p,'detail':'' if i else '\n'.join(extra)})
        elif r.get('end') or r.get('completion'):
            if r.get('date'):out.append({**r,'name':name+'　入学','end':'','detail':'' if r.get('end') else detail})
            if r.get('end'):out.append({**r,'date':r['end'],'end':'','name':name+'　'+r.get('completion','卒業'),'detail':detail})
            if not r.get('date') and not r.get('end'):out.append({**r,'name':name,'detail':detail})
        else:out.append({**r,'name':name,'detail':detail})
    return out

def chronology(d):
    result=[['','','学歴']]
    for r in education_events(d.get('education',[])):
        date=r.get('date','').split('-');result.append([date[0] if date else '',date[1] if len(date)>1 else '',r.get('name','')+ ('\n'+r['detail'] if r.get('detail') else '')])
    result.append(['','',''])
    result.append(['','','職歴'])
    for r in employment_events(d.get('experience',[])):
        date=r.get('date','').split('-');result.append([date[0] if date else '',date[1] if len(date)>1 else '',r.get('name','')])
    result.append(['','','以上']);return result

def plain(value,size=CONTENT_SIZE,bold=False):
    return {'text':str(value or ''),'lines':str(value or '').split('\n'),'size':size,'leading':size*1.35,'bold':bold}

def rich(entries,width):
    """Wrap measured label/content runs without shrinking either font size."""
    rows=[]
    for label,value in entries:
        current=[];used=0
        tokens=[(label+' ' if label else '',HEADING_SIZE)]
        tokens.extend((part,CONTENT_SIZE) for part in re.findall(r"[A-Za-z0-9]+(?:[’'._@/+\-][A-Za-z0-9]+)*|[ \t]+|\n|.",str(value or '')))
        for token,size in tokens:
            if token=='\n':rows.append(current);current=[];used=0;continue
            if not token:continue
            tw=pdfmetrics.stringWidth(token,'JP',size)
            if current and used+tw>width:rows.append(current);current=[];used=0
            parts=[token] if tw<=width else list(token)
            for part in parts:
                pw=pdfmetrics.stringWidth(part,'JP',size)
                if current and used+pw>width:rows.append(current);current=[];used=0
                current.append({'text':part,'size':size});used+=pw
        rows.append(current)
    values=[''.join(r['text'] for r in row) for row in rows]
    return {'text':'\n'.join(values),'lines':values,'runs':rows,'size':HEADING_SIZE,'leading':18}

def measured_rows(rows,widths):
    result=[]
    for row in rows:
        cells=[{**plain(v),'lines':lines(v,CONTENT_SIZE,w-12)} for v,w in zip(row,widths)]
        if row[2] in ['学歴','職歴']:
            cells[2].update(size=HEADING_SIZE,leading=HEADING_SIZE*1.35,bold=True,align='center')
        elif row[2]=='以上':cells[2]['align']='right'
        result.append({'cells':cells,'height':max(22,max(len(c['lines'])*c['leading'] for c in cells)+6)})
    return result

def pad_rows(rows,height,widths):
    rows=list(rows);remaining=height-sum(r['height'] for r in rows)
    while remaining>=24:
        rows.append({'cells':[plain('') for _ in widths],'height':24});remaining-=24
    if remaining>0:
        if rows:rows[-1]['height']+=remaining
        else:rows=[{'cells':[plain('') for _ in widths],'height':height}]
    return rows

def header_layout(d):
    init_font();main=W-100
    kana=rich([('ふりがな',d.get('furigana',''))],main-12)
    kana_height=max(29,len(kana['lines'])*kana['leading']+8)
    birth_height=32
    main_height=max(120,kana_height+22+18*1.35+8+birth_height)
    fields={
        'kana':kana,
        'name':fit(d.get('name',''),main-12,main_height-kana_height-birth_height-22,'氏名',18,12),
        'birth':fit(birth(d),main-140,birth_height,'生年月日'),
        'gender':rich([('性別（任意）',d.get('gender',''))],116),
    }
    phone=rich([('Phone:',d.get('phone','')),('Email:',d.get('email',''))],W-12)
    widest=max(sum(pdfmetrics.stringWidth(run['text'],'JP',run['size']) for run in row) for row in phone['runs'])
    # Widen the contact column to keep the email at 12 pt on one line.
    wide=widest+16>W-210
    contact_width=W if wide else min(W-210,max(220,widest+16))
    address_width=W if wide else W-contact_width
    fields['address']=rich([('ふりがな',d.get('addressKana','')),('現住所 〒',d.get('postalCode','')+('\n'+d['address'] if d.get('address') else ''))],address_width-12)
    fields['contact']=rich([('Phone:',d.get('phone','')),('Email:',d.get('email',''))],contact_width-12)
    fields['alternate']=rich([('ふりがな',d.get('alternateAddressKana','')),('連絡先 〒',d.get('alternatePostalCode','')+('\n'+d['alternateAddress'] if d.get('alternateAddress') else ''))],address_width-12)
    fields['alternatePhone']=rich([('Phone:',d.get('alternatePhone','')),('', '（現住所以外に連絡を希望する場合のみ記入）')],contact_width-12)
    pairs=[(['address'],[W]),(['contact'],[W]),(['alternate'],[W]),(['alternatePhone'],[W])] if wide else [(['address','contact'],[W-contact_width,contact_width]),(['alternate','alternatePhone'],[W-contact_width,contact_width])]
    rows=[{'keys':keys,'widths':widths,'height':max(44,max(len(fields[k]['lines'])*18 for k in keys)+12)} for keys,widths in pairs]
    heights=[r['height'] for r in rows];chronology_y=86+main_height+sum(heights)+16
    return fields,{'contactWidth':contact_width,'contactHeights':heights,'contactRows':rows,'kanaHeight':kana_height,'birthHeight':birth_height,'mainHeight':main_height,'headerEnd':86+main_height,'chronologyY':chronology_y,'chronologyHeight':BOTTOM-chronology_y}

def layout(d):
    fields,header=header_layout(d);widths=[43,28,W-71]
    measured=measured_rows(chronology(d),widths);left=[];right=[];used=0
    capacity=header['chronologyHeight']-GRID_HEADER-2
    for row in measured:
        if not right and used+row['height']<=capacity:left.append(row);used+=row['height']
        else:right.append(row)
    qualifications=[]
    for r in d.get('licenses',[]):
        date=r.get('date','').split('-');qualifications.append([date[0] if date else '',date[1] if len(date)>1 else '',r.get('name','')])
    quals=measured_rows(qualifications,widths) or pad_rows([],24,widths)
    right=right or pad_rows([],24,widths)
    titles={'motivation':MOTIVATION,'preferences':PREFERENCES}
    heading_heights={k:max(28,len(lines(v,HEADING_SIZE,(W-12)*.96))*HEADING_SIZE*1.35+10) for k,v in titles.items()}
    bodies={}
    for key,value,minimum in [('motivation','\n\n'.join(filter(None,[d.get('motivation',''),d.get('strengths','')])),40),('preferences',d.get('preferences',''),24)]:
        wrapped=lines(value,CONTENT_SIZE,(W-12)*.96)
        bodies[key]=max(minimum,len(wrapped)*18+16)
        fields[key]={**plain(value),'lines':wrapped,'leading':18,'topPadding':8}
    heights={'chronology':GRID_HEADER+sum(r['height'] for r in right)+2,'qualifications':GRID_HEADER+sum(r['height'] for r in quals)+2,**{k:heading_heights[k]+bodies[k] for k in titles}}
    budget=722-36
    if capacity<24 or sum(heights.values())>budget:
        raise ValueError('空白行・余白を自動調整しましたが、見出し13pt・本文12ptのまま2ページに収められません。内容は保存されています。長い内容を整理してください。文字は縮小・省略していません。')
    desired={'chronology':134,'qualifications':140,'motivation':240,'preferences':110}
    deficits={k:max(0,desired[k]-heights[k]) for k in heights};spare=budget-sum(heights.values());total=sum(deficits.values())
    if total:
        fraction=min(1,spare/total)
        for k in heights:heights[k]+=deficits[k]*fraction
    spare=budget-sum(heights.values())
    for k,weight in [('chronology',.15),('qualifications',.2),('motivation',.5),('preferences',.15)]:heights[k]+=spare*weight
    right=pad_rows(right,heights['chronology']-GRID_HEADER-2,widths)
    quals=pad_rows(quals,heights['qualifications']-GRID_HEADER-2,widths)
    return {'pages':2,'widths':widths,'jobs':[pad_rows(left,capacity,widths),right],'qualifications':quals,'fields':fields,'header':header,'page2':heights,'headingHeights':heading_heights,'fonts':{'heading':HEADING_SIZE,'content':CONTENT_SIZE}}

def pdf(d,out):
    from reportlab.pdfgen import canvas
    from reportlab.lib.utils import ImageReader
    model=layout(d);c=canvas.Canvas(out,pagesize=(PAGE_W,PAGE_H));c.setTitle('履歴書');c.setAuthor(d.get('name',''))
    def rule(x,y,w,h):c.setLineWidth(.5);c.rect(x,PAGE_H-y-h,w,h,stroke=1,fill=0)
    def text(block,x,y):
        for i,line in enumerate(block['lines']):
            baseline=PAGE_H-y-block['size']-i*block['leading'];cx=x
            for run in (block['runs'][i] if 'runs' in block else [{'text':line,'size':block['size'],'bold':block.get('bold',False)}]):
                c.setFont('JP',run['size'])
                if run.get('bold'):
                    c.saveState();c.setLineWidth(.18);t=c.beginText(cx,baseline);t.setFont('JP',run['size']);t.setTextRenderMode(2);t.textOut(run['text']);c.drawText(t);c.restoreState()
                else:c.drawString(cx,baseline,run['text'])
                cx+=pdfmetrics.stringWidth(run['text'],'JP',run['size'])
    def label(value,x,y,size=HEADING_SIZE):text(plain(value,size),x,y)
    def grid(rows,x,y,label_value,total_height):
        widths=model['widths'];rule(x,y,W,total_height)
        for offset in [widths[0],sum(widths[:2])]:c.line(x+offset,PAGE_H-y,x+offset,PAGE_H-y-total_height)
        for value,offset in [('年',0),('月',widths[0]),(label_value,sum(widths[:2]))]:label(value,x+offset+5,y+5)
        cursor=y+GRID_HEADER;c.line(x,PAGE_H-cursor,x+W,PAGE_H-cursor)
        for row in rows:
            offset=0
            for field,width in zip(row['cells'],widths):
                tx=x+offset+6
                if field.get('align')=='center':tx=x+offset+(width-pdfmetrics.stringWidth(field['lines'][0],'JP',field['size']))/2
                elif field.get('align')=='right':tx=x+offset+width-6-pdfmetrics.stringWidth(field['lines'][0],'JP',field['size'])
                text(field,tx,cursor+4);offset+=width
            cursor+=row['height'];c.line(x,PAGE_H-cursor,x+W,PAGE_H-cursor)
    def footer(page):c.setFont('JP',CONTENT_SIZE);c.drawRightString(PAGE_W-42,24,str(page))
    label('履　歴　書',X,42);label(jpdate(asof(d).isoformat())+' 現在',X+W-180,61,CONTENT_SIZE)
    h=model['header'];main=W-100;rule(X,86,main,h['mainHeight']);rule(X+main+7,89,85,113)
    name_y=86+h['kanaHeight'];birth_y=h['headerEnd']-h['birthHeight']
    text(model['fields']['kana'],X+6,90);c.line(X,PAGE_H-name_y,X+main,PAGE_H-name_y)
    label('氏名',X+6,name_y+4);text(model['fields']['name'],X+6,name_y+22);c.line(X,PAGE_H-birth_y,X+main,PAGE_H-birth_y)
    text(model['fields']['birth'],X+6,birth_y+5);c.line(X+main-128,PAGE_H-birth_y,X+main-128,PAGE_H-h['headerEnd']);text(model['fields']['gender'],X+main-122,birth_y+5)
    if d.get('photo'):
        image=ImageReader(io.BytesIO(base64.b64decode(d['photo'].split(',',1)[1])));c.drawImage(image,X+main+7,PAGE_H-202,width=85,height=113,preserveAspectRatio=True,anchor='c')
    else:
        text(fit('写真を貼る位置',73,60,'写真',HEADING_SIZE,HEADING_SIZE),X+main+13,104)
        text(fit('40mm × 30mm',73,45,'写真寸法'),X+main+13,160)
    y=h['headerEnd']
    for row in h['contactRows']:
        rule(X,y,W,row['height']);offset=0
        for index,(key,width) in enumerate(zip(row['keys'],row['widths'])):
            if index:c.line(X+offset,PAGE_H-y,X+offset,PAGE_H-y-row['height'])
            text(model['fields'][key],X+offset+6,y+4);offset+=width
        y+=row['height']
    grid(model['jobs'][0],X,h['chronologyY'],TITLE,h['chronologyHeight']);footer(1);c.showPage()
    heights=model['page2'];y=42
    grid(model['jobs'][1],X,y,TITLE,heights['chronology']);y+=heights['chronology']+12
    grid(model['qualifications'],X,y,'免許・資格',heights['qualifications']);y+=heights['qualifications']+12
    for key,heading in [('motivation',MOTIVATION),('preferences',PREFERENCES)]:
        height=heights[key];label_h=model['headingHeights'][key];rule(X,y,W,height);c.line(X,PAGE_H-y-label_h,X+W,PAGE_H-y-label_h)
        text(fit(heading,W-12,label_h,heading,HEADING_SIZE,HEADING_SIZE),X+6,y+4);text(model['fields'][key],X+6,y+label_h+8);y+=height+12
    footer(2);c.showPage();c.save()
    import fitz
    with fitz.open(out) as check:
        if len(check)!=2:raise ValueError('2ページの履歴書を生成できませんでした。')

def word(d,out):
    from docx import Document
    from docx.shared import Pt,Mm
    from docx.oxml import OxmlElement
    from docx.oxml.ns import qn
    from docx.enum.table import WD_ROW_HEIGHT_RULE
    from docx.enum.text import WD_BREAK,WD_ALIGN_PARAGRAPH
    model=layout(d);doc=Document();sec=doc.sections[0];sec.page_width=Pt(PAGE_W);sec.page_height=Pt(PAGE_H)
    sec.left_margin=sec.right_margin=Pt(42);sec.top_margin=sec.bottom_margin=Pt(42)
    style=doc.styles['Normal'];style.font.name='Noto Serif JP';style.font.size=Pt(CONTENT_SIZE);style.element.get_or_add_rPr().rFonts.set(qn('w:eastAsia'),'Noto Serif JP')
    style.paragraph_format.space_after=Pt(0);style.paragraph_format.space_before=Pt(0)
    def cell_format(cell):
        pr=cell._tc.get_or_add_tcPr();m=OxmlElement('w:tcMar')
        for edge in ['top','left','bottom','right']:
            el=OxmlElement('w:'+edge);el.set(qn('w:w'),'0');el.set(qn('w:type'),'dxa');m.append(el)
        pr.append(m);pr.append(OxmlElement('w:noWrap'))
    def write(cell,blocks,padding=3):
        cell_format(cell);cell.text=''
        for i,b in enumerate(blocks):
            p=cell.paragraphs[0] if i==0 else cell.add_paragraph();p.paragraph_format.space_before=Pt(b.get('topPadding',0));p.paragraph_format.line_spacing=Pt(b['leading']);p.paragraph_format.left_indent=Pt(padding);p.paragraph_format.right_indent=Pt(padding)
            p.alignment={'center':WD_ALIGN_PARAGRAPH.CENTER,'right':WD_ALIGN_PARAGRAPH.RIGHT}.get(b.get('align'),WD_ALIGN_PARAGRAPH.LEFT)
            for j,line in enumerate(b['lines']):
                if j:p.add_run().add_break()
                for run in (b['runs'][j] if 'runs' in b else [{'text':line,'size':b['size'],'bold':b.get('bold',False)}]):
                    r=p.add_run(run['text']);r.bold=run.get('bold',False);r.font.size=Pt(run['size']);r.font.name='Noto Serif JP';r._element.get_or_add_rPr().rFonts.set(qn('w:eastAsia'),'Noto Serif JP')
    def fixrow(row,height):
        row.height=Pt(height);row.height_rule=WD_ROW_HEIGHT_RULE.EXACTLY;row._tr.get_or_add_trPr().append(OxmlElement('w:cantSplit'))
    def nested(cell,rows,widths,heights):
        cell_format(cell);cell.text='';cell.paragraphs[0].paragraph_format.line_spacing=Pt(1)
        t=cell.add_table(rows=0,cols=len(widths));t.autofit=False;t.style='Table Grid'
        for col,width in zip(t.columns,widths):col.width=Pt(width)
        for values,height in zip(rows,heights):
            row=t.add_row();fixrow(row,height)
            for target,field,width in zip(row.cells,values,widths):target.width=Pt(width);write(target,[field])
        for p in [cell.paragraphs[0],cell.paragraphs[-1]]:
            p.paragraph_format.line_spacing=Pt(1);p.paragraph_format.space_after=Pt(0);p.paragraph_format.space_before=Pt(0)
            for run in p.runs:run.font.size=Pt(1)
        return t
    def outer(heights):
        t=doc.add_table(rows=len(heights),cols=1);t.autofit=False;t.columns[0].width=Pt(W)
        for row,height in zip(t.rows,heights):fixrow(row,height);cell_format(row.cells[0])
        return [r.cells[0] for r in t.rows]
    def chronology_cell(cell,rows,label):
        vals=[[plain('年',HEADING_SIZE),plain('月',HEADING_SIZE),plain(label,HEADING_SIZE)]]+[r['cells'] for r in rows]
        heights=[GRID_HEADER]+[r['height'] for r in rows];heights[-1]-=2;nested(cell,vals,model['widths'],heights)
    h=model['header'];first=outer([44,h['mainHeight'],*h['contactHeights'],16,h['chronologyHeight']]);write(first[0],[plain('履 歴 書',HEADING_SIZE),plain(jpdate(asof(d).isoformat())+' 現在')])
    t=nested(first[1],[[plain(''),plain('')]],[W-100,100],[h['mainHeight']-2]);left,right=t.rows[0].cells
    inner=nested(left,[[model['fields']['kana']],[plain('')],[plain('')]],[W-100],[h['kanaHeight'],h['mainHeight']-h['kanaHeight']-h['birthHeight']-4,h['birthHeight']])
    write(inner.rows[1].cells[0],[plain('氏名',HEADING_SIZE),model['fields']['name']])
    nested(inner.rows[2].cells[0],[[model['fields']['birth'],model['fields']['gender']]],[W-228,128],[h['birthHeight']-2])
    if d.get('photo'):
        right.text='';p=right.paragraphs[0];p.paragraph_format.line_spacing=Pt(114);p.add_run().add_picture(io.BytesIO(base64.b64decode(d['photo'].split(',',1)[1])),width=Mm(30),height=Mm(40))
    else:write(right,[fit('写真を貼る位置',88,60,'写真',HEADING_SIZE,HEADING_SIZE),fit('縦40mm × 横30mm',88,52,'写真寸法')])
    for cell,row in zip(first[2:2+len(h['contactRows'])],h['contactRows']):nested(cell,[[model['fields'][k] for k in row['keys']]],row['widths'],[row['height']-2])
    chronology_cell(first[-1],model['jobs'][0],TITLE)
    p=doc.add_paragraph();p.paragraph_format.line_spacing=Pt(1);p.add_run().add_break(WD_BREAK.PAGE)
    heights=model['page2'];second=outer([heights['chronology'],12,heights['qualifications'],12,heights['motivation'],12,heights['preferences']])
    chronology_cell(second[0],model['jobs'][1],TITLE);chronology_cell(second[2],model['qualifications'],'免許・資格')
    for cell,key,label in [(second[4],'motivation',MOTIVATION),(second[6],'preferences',PREFERENCES)]:
        label_h=model['headingHeights'][key];labelblock=fit(label,W-12,label_h,label,HEADING_SIZE,HEADING_SIZE);nested(cell,[[labelblock],[model['fields'][key]]],[W],[label_h,heights[key]-label_h-2])
    doc.add_paragraph().paragraph_format.line_spacing=Pt(1);doc.save(out)
