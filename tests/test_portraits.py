import unittest,sys,tempfile,io,json,base64
from pathlib import Path
from unittest.mock import patch
from PIL import Image
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'server'))
import portraits,documents
import fitz

class PortraitTests(unittest.TestCase):
 def image(self,size=(1200,3000)):
  b=io.BytesIO();Image.new('RGB',size,'white').save(b,format='PNG');return b.getvalue()
 def test_document_image_is_not_a_photo_when_no_face_is_detected(self):
  with patch.object(portraits,'detect_faces',return_value=[]):
   self.assertEqual(portraits.portrait_candidates(self.image()),[])
   self.assertEqual(portraits.portrait_candidates(self.image((1200,1700))),[])
 def test_face_on_a_scanned_cv_returns_only_a_small_portrait_crop(self):
  with patch.object(portraits,'detect_faces',return_value=[{'x':.8,'y':.88,'width':.06,'height':.04,'confidence':.99}]):
   result=portraits.portrait_candidates(self.image())
  self.assertEqual(len(result),1);crop=result[0]
  self.assertLess(crop['width'],300);self.assertLess(crop['height'],400)
  self.assertAlmostEqual(crop['width']/crop['height'],.75,places=2)
  self.assertTrue(crop['portrait'])
 def test_only_small_top_right_embedded_pdf_image_can_bypass_face_detection(self):
  with tempfile.TemporaryDirectory() as folder:
   path=Path(folder)/'portrait.pdf';pdf=fitz.open();page=pdf.new_page();page.insert_image(fitz.Rect(450,50,530,160),stream=self.image((300,400)));pdf.save(path);pdf.close()
   with patch.object(portraits,'detect_faces',return_value=[]),patch.object(documents,'ocr_image',return_value='原文です'):
    result=documents.extract(str(path),path.name)
   self.assertEqual(len(result['photos']),1)
   path=Path(folder)/'fullscan.pdf';pdf=fitz.open();page=pdf.new_page();page.insert_image(page.rect,stream=self.image((1200,1700)));pdf.save(path);pdf.close()
   with patch.object(portraits,'detect_faces',return_value=[]),patch.object(documents,'ocr_image',return_value='原文です'):
    result=documents.extract(str(path),path.name)
   self.assertEqual(result['photos'],[]);self.assertTrue(result['pages'])
 def test_native_mac_detector_uses_temporary_image_and_cleans_it(self):
  paths=[]
  def run(args,**kw):
   paths.append(Path(args[-1]));self.assertTrue(paths[-1].exists());self.assertTrue(args[-2].endswith('mac_faces.js'))
   return type('Result',(),{'returncode':0,'stdout':json.dumps({'faces':[{'x':.7,'y':.8,'width':.1,'height':.1,'confidence':.9}]}).encode()})()
  with patch.object(portraits.sys,'platform','darwin'),patch.object(portraits.subprocess,'run',side_effect=run):
   self.assertEqual(len(portraits.detect_faces(Image.new('RGB',(200,300)))),1)
  self.assertTrue(all(not p.exists() for p in paths))
