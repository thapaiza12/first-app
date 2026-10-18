import unittest,sys,tempfile,base64,io,zipfile
from pathlib import Path
from PIL import Image
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'server'))
import documents
from unittest.mock import patch
class DocumentReading(unittest.TestCase):
 def test_word_textboxes_and_headers_are_read_including_contact_and_history(self):
  xml='''<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>氏名：テスト 太郎</w:t></w:r></w:p><w:p><w:r><w:pict><w:txbxContent><w:p><w:r><w:t>現住所：東京都千代田区1-1</w:t></w:r></w:p><w:p><w:r><w:t>電話番号：090-1234-5678</w:t></w:r></w:p></w:txbxContent></w:pict></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>2020年4月 株式会社テスト 入社</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>'''
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'fixture.docx'
   with zipfile.ZipFile(p,'w') as z:
    z.writestr('word/document.xml',xml);z.writestr('word/header1.xml','<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>メール：test@example.com</w:t></w:r></w:p></w:hdr>')
   text=documents.extract(str(p),p.name)['text']
   for value in ['東京都千代田区1-1','090-1234-5678','株式会社テスト','test@example.com']:self.assertIn(value,text)
 def test_pdf_keeps_both_pages_and_sends_legible_full_page_images(self):
  import fitz
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'cv.pdf';pdf=fitz.open()
   for content in ['Address: Tokyo 1-1; Phone: 090-1234-5678','Work history: Sample Company 2020-04; Education: Sample University']:
    page=pdf.new_page(width=595,height=842);page.insert_text((30,700),content,fontsize=9)
   pdf.save(p);pdf.close();result=documents.extract(str(p),p.name)
   self.assertIn('090-1234-5678',result['text']);self.assertIn('Sample Company',result['text']);self.assertEqual(len(result['pages']),2)
   for page in result['pages']:
    image=Image.open(io.BytesIO(base64.b64decode(page.split(',')[1])))
    self.assertGreaterEqual(image.width,1400)
 def test_native_pdf_fast_path_does_not_skip_image_based_sections(self):
  import fitz
  with tempfile.TemporaryDirectory() as d:
   for has_image in [False,True]:
    p=Path(d)/('mixed.pdf' if has_image else 'native.pdf');pdf=fitz.open();page=pdf.new_page()
    page.insert_text((30,50),'Native CV text and contact details. '*5,fontsize=8)
    if has_image:
     buffer=io.BytesIO();Image.new('RGB',(400,600),'white').save(buffer,format='PNG');page.insert_image(fitz.Rect(30,150,500,700),stream=buffer.getvalue())
    pdf.save(p);pdf.close();result=documents.extract(str(p),p.name)
    self.assertEqual(result['textReady'],not has_image)
 def test_scanned_images_keep_readable_resolution_for_gemini(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'scan.png';Image.new('RGB',(1800,2600),'white').save(p)
   with patch.object(documents,'ocr_image',return_value='氏名：テスト'):
    result=documents.extract(str(p),p.name)
   image=Image.open(io.BytesIO(base64.b64decode(result['pages'][0].split(',')[1])))
   self.assertEqual(image.size,(1800,2600))
if __name__=='__main__':unittest.main()
