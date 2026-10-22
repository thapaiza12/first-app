import copy,io,sys,tempfile,unittest,zipfile
from pathlib import Path
import xml.etree.ElementTree as E
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'server'))
import fitz
from resume_layout import layout,employment_events,education_events,chronology
from export_documents import render_document

class ResumeLayoutTests(unittest.TestCase):
    def test_education_events_are_separate_in_pdf_and_word(self):
        d=self.sample();d['education']=[{'name':'テスト大学','date':'2012-04','end':'2016-03'}]
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
