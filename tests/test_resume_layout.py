import copy,io,sys,tempfile,unittest,zipfile
from pathlib import Path
import xml.etree.ElementTree as E
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'server'))
import fitz
from resume_layout import layout,employment_events,education_events,chronology,lines
from export_documents import render_document

class ResumeLayoutTests(unittest.TestCase):
    def test_education_events_are_separate_in_pdf_and_word(self):
        d=self.sample();d['education']=[{'name':'テスト大学','date':'2012-04','end':'2016-03'}]
        legacy=education_events([{'name':'大学 入学','date':'2018-02','end':'2022-04'}]);self.assertEqual(len(legacy),2);self.assertEqual(legacy[1]['date'],'2022-04')
        self.assertEqual(chronology(d)[1:3],[['2012','04','テスト大学　入学'],['2016','03','テスト大学　卒業']])
        self.assertEqual(education_events([{'name':'大学','date':'2016-03','detail':'大学 卒業'}])[0]['detail'],'')
        with tempfile.TemporaryDirectory() as folder:
            pdf=Path(folder)/'education.pdf';render_document(d,'pdf',str(pdf))
            with fitz.open(pdf) as doc:
                self.assertEqual(len(doc),2)
                text=''.join(page.get_text() for page in doc)
                self.assertIn('入学',text);self.assertIn('卒業',text)
            word=Path(folder)/'education.docx';render_document(d,'docx',str(word))
            with zipfile.ZipFile(word) as archive:
                xml=E.fromstring(archive.read('word/document.xml'))
                ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
                rows=[''.join(r.itertext()) for r in xml.findall('.//w:tr',ns)]
                self.assertTrue(any('入学' in r and '卒業' not in r for r in rows))
                self.assertTrue(any('卒業' in r and '入学' not in r for r in rows))
    def test_contact_headers_spacing_and_alignment(self):
        d=self.sample();d.update(email='long.applicant.address@example.com',phone='090-1234-5678')
        m=layout(d);contact=m['fields']['contact']
        self.assertEqual(contact['lines'],['Phone: 090-1234-5678','Email: long.applicant.address@example.com'])
        rows=chronology(d);idx=next(i for i,r in enumerate(rows) if r[2]=='職歴')
        self.assertEqual(rows[idx-1],['','',''])
        with tempfile.TemporaryDirectory() as folder:
            p=Path(folder)/'contact.pdf';render_document(d,'pdf',str(p))
            with fitz.open(p) as pdf:
                text=''.join(page.get_text() for page in pdf)
                self.assertEqual(text.count('各別にまとめて書く'),2)
                self.assertIn('Email: long.applicant.address@example.com',text)
                endings=[span for page in pdf for block in page.get_text('dict')['blocks'] if 'lines' in block for line in block['lines'] for span in line['spans'] if span['text']=='以上']
                self.assertGreater(endings[0]['bbox'][0],500)
            p=Path(folder)/'contact.docx';render_document(d,'docx',str(p))
            with zipfile.ZipFile(p) as archive:
                xml=E.fromstring(archive.read('word/document.xml'));ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
                for paragraph in xml.findall('.//w:p',ns):
                    value=''.join(t.text or '' for t in paragraph.findall('.//w:t',ns))
                    if value in ['学歴','職歴']:
                        self.assertEqual(paragraph.find('w:pPr/w:jc',ns).get('{'+ns['w']+'}val'),'center')
                        self.assertIsNotNone(paragraph.find('w:r/w:rPr/w:b',ns))
                    if value=='以上':self.assertEqual(paragraph.find('w:pPr/w:jc',ns).get('{'+ns['w']+'}val'),'right')
    def test_unused_rows_are_reclaimed_for_long_motivation_without_losing_text(self):
        d=self.sample();d['motivation']='応募者として実際の経験を活かして貢献します。'*40+'最後まで保持する文章です。'
        d['preferences']='貴社の規定に従います。'
        original=copy.deepcopy(d);m=layout(d)
        self.assertGreater(m['page2']['motivation'],214)
        self.assertLess(m['page2']['qualifications'],140)
        self.assertLess(m['page2']['preferences'],170)
        self.assertAlmostEqual(sum(m['page2'].values())+36,722)
        with tempfile.TemporaryDirectory() as folder:
            pdf=Path(folder)/'long.pdf';render_document(d,'pdf',str(pdf))
            with fitz.open(pdf) as pages:
                self.assertEqual(len(pages),2)
                text=''.join(page.get_text() for page in pages).replace('\n','')
                self.assertIn(d['motivation'],text)
                for page in pages:
                    for word in page.get_text('words'):self.assertLessEqual(word[3],page.rect.height)
            word=Path(folder)/'long.docx';render_document(d,'docx',str(word))
            with zipfile.ZipFile(word) as archive:
                xml=E.fromstring(archive.read('word/document.xml'));ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
                text=''.join(t.text or '' for t in xml.findall('.//w:t',ns))
                self.assertIn(d['motivation'],text)
                self.assertEqual(len(xml.findall('.//w:br[@w:type="page"]',ns)),1)
        self.assertEqual(d,original)
    def test_history_and_qualifications_can_borrow_unused_page_two_space(self):
        for key,value in [('experience',[{'name':'会社'+str(i),'date':'2010-04','end':'2020-03'} for i in range(15)]),('licenses',[{'name':'資格'+str(i),'date':'2020-01'} for i in range(14)])]:
            d=self.sample();d[key]=value;m=layout(d)
            self.assertAlmostEqual(sum(m['page2'].values())+36,722)
            with tempfile.TemporaryDirectory() as folder:
                out=Path(folder)/'expanded.pdf';render_document(d,'pdf',str(out))
                with fitz.open(out) as pages:
                    self.assertEqual(len(pages),2)
                    self.assertIn('会社14' if key=='experience' else '資格13',''.join(p.get_text() for p in pages))
    def test_short_and_long_documents_fill_both_pages_to_matching_bottom_margins(self):
        for count in [1,20,30]:
            d=self.sample();d['motivation']='Experience in international operations and project management. '*count
            m=layout(d)
            self.assertAlmostEqual(sum(m['page2'].values())+36,722)
            with tempfile.TemporaryDirectory() as folder:
                out=Path(folder)/'balanced.pdf';render_document(d,'pdf',str(out))
                with fitz.open(out) as pdf:
                    self.assertEqual(len(pdf),2)
                    for page in pdf:
                        bottom=max(item['rect'].y1 for item in page.get_drawings())
                        self.assertAlmostEqual(bottom,764,places=1)
    def test_english_words_wrap_at_word_boundaries(self):
        value='Experienced Operations Specialist supporting international business development.'
        wrapped=lines(value,10.5,180)
        self.assertEqual(''.join(wrapped),value)
        for word in value.split():self.assertTrue(any(word in line for line in wrapped),word)
    def test_birth_and_gender_use_separate_cells_with_a_clear_gap(self):
        d=self.sample();d.update(birthDate='2001-02-27',gender='男')
        m=layout(d);self.assertNotIn('性別',m['fields']['birth']['text']);self.assertIn('男',m['fields']['gender']['text'])
        with tempfile.TemporaryDirectory() as folder:
            out=Path(folder)/'birth.pdf';render_document(d,'pdf',str(out))
            with fitz.open(out) as pdf:
                spans=[span for block in pdf[0].get_text('dict')['blocks'] if 'lines' in block for line in block['lines'] for span in line['spans']]
                birthday=next(span for span in spans if '2001年2月27日' in span['text'])
                gender=next(span for span in spans if '性別' in span['text'])
                self.assertGreater(gender['bbox'][0]-birthday['bbox'][2],20)
            out=Path(folder)/'birth.docx';render_document(d,'docx',str(out))
            with zipfile.ZipFile(out) as archive:
                root=E.fromstring(archive.read('word/document.xml'));ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
                row=next(row for row in root.findall('.//w:tr',ns) if any('2001年2月27日' in ''.join(t.text or '' for t in cell.findall('w:p/w:r/w:t',ns)) for cell in row.findall('w:tc',ns)) and len(row.findall('w:tc',ns))==2)
                texts=[''.join(t.text or '' for t in cell.findall('.//w:t',ns)) for cell in row.findall('w:tc',ns)]
                self.assertTrue(any('2001年' in text and '性別' not in text for text in texts))
                self.assertTrue(any('性別' in text and '2001年' not in text for text in texts))
    def test_requested_13pt_headings_and_11_5pt_content_in_pdf_and_word(self):
        d=self.sample();d.update(furigana='やまだ たろう',phone='090-1234-5678',email='long.applicant.address@example.com',birthDate='2001-02-27',gender='男',address='東京都千代田区丸の内1-2-3',preferences='貴社の規定に従います',motivation='私は今、農業の仕事をしています。食材を大切にする経験をしました。次は、食料品製造業でパン作りの仕事に挑戦したいです。Boulangerie EMUで真面目に一生懸命働き、日本の素晴らしいパン作りや仕事の進め方を学びたいです。一日も早く仕事を覚えて貴社に貢献し、将来は日本で学んだ知識や技術を母国のネパールでも活かしたいと考えています。どうぞよろしくお願いします。')
        m=layout(d);self.assertEqual(m['fonts'],{'heading':13,'content':11.5});self.assertEqual(m['fields']['motivation']['size'],11.5)
        with tempfile.TemporaryDirectory() as folder:
            out=Path(folder)/'fonts.pdf';render_document(d,'pdf',str(out))
            with fitz.open(out) as pdf:
                self.assertEqual(len(pdf),2)
                spans=[span for page in pdf for block in page.get_text('dict')['blocks'] if 'lines' in block for line in block['lines'] for span in line['spans'] if span['text'].strip()]
                for span in spans:
                    if d['name'] in span['text']:self.assertEqual(round(span['size'],2),18)
                    else:self.assertIn(round(span['size'],2),[11.5,13],span['text'])
                heading=next(span for span in spans if '志望の動機' in span['text']);self.assertEqual(heading['size'],13)
                text=''.join(page.get_text() for page in pdf).replace('\n','');self.assertIn(d['motivation'],text)
            out=Path(folder)/'fonts.docx';render_document(d,'docx',str(out))
            with zipfile.ZipFile(out) as archive:
                root=E.fromstring(archive.read('word/document.xml'));ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
                for run in root.findall('.//w:r',ns):
                    value=''.join(t.text or '' for t in run.findall('w:t',ns))
                    if not value.strip():continue
                    size=int(run.find('w:rPr/w:sz',ns).get('{'+ns['w']+'}val'))
                    self.assertIn(size,[23,26,36],value)
                    if '志望の動機' in value:self.assertEqual(size,26)
                    if '私は今' in value:self.assertEqual(size,23)
    def test_fixed_sizes_are_never_silently_shrunk_to_hide_overflow(self):
        d=self.sample();d['motivation']='応募者として実際の経験を活かして貢献します。'*60;before=copy.deepcopy(d)
        with tempfile.TemporaryDirectory() as folder:
            for fmt in ['pdf','docx']:
                out=Path(folder)/('fixed.'+fmt)
                with self.assertRaisesRegex(ValueError,'13pt・本文11.5pt'):render_document(d,fmt,str(out))
                self.assertFalse(out.exists())
        self.assertEqual(d,before)
    def test_long_contact_and_kana_expand_layout_without_reducing_font_sizes(self):
        d=self.sample();d.update(furigana='やまだたろう'*8,email='very.long.applicant.address.department@example-company.co.jp')
        m=layout(d);self.assertGreater(m['header']['mainHeight'],120);self.assertEqual(m['header']['contactWidth'],511.28)
        self.assertEqual(len(m['fields']['contact']['lines']),2)
        self.assertTrue(all(run['size'] in [11.5,13] for row in m['fields']['contact']['runs'] for run in row))
        with tempfile.TemporaryDirectory() as folder:
            for fmt in ['pdf','docx']:render_document(d,fmt,str(Path(folder)/('long-contact.'+fmt)))
    def sample(self):return {'type':'rirekisho','name':'山田 太郎','documentDate':'2026-10-16','education':[{'date':'2013-04','name':'大学 入学'}],'experience':[{'date':'2017-04','end':'2024-03','name':'株式会社テスト'}],'licenses':[],'motivation':'営業経験を活かして貢献します。'}
    def test_each_company_has_enter_and_exit_rows_and_current_employment_is_not_retirement(self):
        events=employment_events([{'name':'A社','date':'2020-04','end':'2024-03'},{'name':'B社','date':'2024-04','current':True}])
        self.assertEqual([r['name'] for r in events],['A社　入社','A社　退社','B社　入社','現在に至る'])
        self.assertEqual(events[1]['date'],'2024-03')
        self.assertEqual(len(employment_events([{'name':'A社 入社','date':'2020-04'},{'name':'A社 退社','date':'2024-03'}])),2)
    def test_many_companies_and_long_text_never_create_page_three(self):
        for key,value in [('experience',[{'name':'会社'+str(i),'date':'2020-04','end':'2024-03'} for i in range(40)]),('motivation','とても長い文章です。'*700),('licenses',[{'name':'資格'+str(i)} for i in range(40)])]:
            d=self.sample();d[key]=value;before=copy.deepcopy(d)
            with tempfile.TemporaryDirectory() as folder:
                for fmt in ['pdf','docx']:
                    out=Path(folder)/('resume.'+fmt)
                    with self.assertRaisesRegex(ValueError,'2ページ'):render_document(d,fmt,str(out))
                    self.assertFalse(out.exists())
            self.assertEqual(d,before)
    def test_pdf_has_exactly_two_pages_and_all_employment_dates(self):
        d=self.sample();d['experience']=[{'name':'会社'+str(i),'date':'2010-04','end':'2020-03'} for i in range(8)]
        with tempfile.TemporaryDirectory() as folder:
            out=Path(folder)/'cv.pdf';render_document(d,'pdf',str(out));pdf=fitz.open(out);self.assertEqual(len(pdf),2)
            text=''.join(p.get_text() for p in pdf)
            self.assertEqual(text.count('入社'),8);self.assertEqual(text.count('退社'),8)
            self.assertIn('会社7',text)
            for page in pdf:
                for word in page.get_text('words'):
                    self.assertGreaterEqual(word[0],0);self.assertLessEqual(word[2],page.rect.width+.1)
                    self.assertGreaterEqual(word[1],0);self.assertLessEqual(word[3],page.rect.height+.1)
    def test_word_has_two_fixed_sheets_and_nested_text_can_be_imported(self):
        from documents import extract
        ns={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
        with tempfile.TemporaryDirectory() as folder:
            out=Path(folder)/'cv.docx';render_document(self.sample(),'docx',str(out))
            with zipfile.ZipFile(out) as z:root=E.fromstring(z.read('word/document.xml'))
            self.assertEqual(len(root.findall('.//w:br[@w:type="page"]',ns)),1)
            heights=root.findall('.//w:trHeight',ns)
            self.assertTrue(heights);self.assertTrue(all(h.get('{'+ns['w']+'}hRule')=='exact' for h in heights))
            text=extract(str(out),'cv.docx')['text'];self.assertIn('山田 太郎',text);self.assertIn('株式会社テスト',text);self.assertIn('営業経験',text)

if __name__=='__main__':unittest.main()
