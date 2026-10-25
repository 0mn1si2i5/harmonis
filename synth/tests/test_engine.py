"""验证数据映射、完整 CLI 和循环接缝。"""
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
import numpy as np
from scipy.io import wavfile
from engine.harmony import pentatonic_step
from engine.plucks import parse, notes
from engine.song import Song

ROOT = Path(__file__).resolve().parents[1]

class MappingTests(unittest.TestCase):
    def test_scale(self):
        self.assertEqual([pentatonic_step(62,k) for k in (-2,-1,0,1,4,5)], [57,60,62,64,72,74])
        with self.assertRaises(ValueError):
            pentatonic_step(61,1)

    def test_mapping(self):
        data = [{'base_cards':4,'base_note':62,'fold_above':69,'gain':.7,'steps':[
            dict(bar=1,beat=k/2,cards=c) for k,c in enumerate([4,4,7,3,10])]}]
        out = notes(Song(150,2),data)
        self.assertEqual([v[1] for v in out],[62,62,69,60,64])
        self.assertEqual(out[1],(.2,62,.7))

    def test_parse(self):
        csv = '# 注释\n\n小节,拍,牌数\n2,0,4\n2,.5,5\n'
        a = parse(csv)
        self.assertEqual(a,parse(json.dumps(a)))
        self.assertEqual(a,parse(json.dumps({'segments':a})))
        self.assertEqual(len(parse('1,0,4')[0]['steps']),1)
        for text in ('bar,beat,cards\n1,x,4','1,2','1,0,4.5','{bad','[{"steps":[{}]}]'):
            with self.subTest(text=text), self.assertRaises(ValueError):
                parse(text)

    def test_song(self):
        self.assertAlmostEqual(Song(150,8,pickup_beats=2).T(2,.5),2.6)
        with self.assertRaisesRegex(ValueError,'整数'):
            Song(151,2,loop=True)
        with self.assertRaises(ValueError):
            Song(150,2,loop=True,pickup_beats=2)
        s = Song(150,2,loop=True,tail=9)
        x = np.ones((2,s.length))
        folded = s.fold(x)
        self.assertEqual(folded.shape,(2,153600))
        self.assertAlmostEqual(folded.sum(),x.sum())

class RenderTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        cls.path = Path(cls.tmp.name)

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def run_render(self,*args):
        p = subprocess.run([sys.executable,*args],cwd=ROOT,text=True,capture_output=True)
        self.assertEqual(p.returncode,0,p.stderr)
        return p.stdout

    def test_loop_cli(self):
        out = self.path/'loop.wav'; peaks = self.path/'peaks.json'
        stdout = self.run_render('-m','engine.render','scores/template_150.py','--loop','--bars','2','--out',str(out),'--peaks',str(peaks),'--stems',str(self.path/'stems'))
        sr,x = wavfile.read(out); x=x.astype(float)/32767
        self.assertEqual(len(x),153600)
        diff = np.max(np.abs(x[0]-x[-1]))
        self.assertLess(diff,.05)
        doubled = np.concatenate([x,x]); seam=len(x); n=round(.005*sr)
        rms = lambda a: np.sqrt(np.mean(a*a))
        center = rms(doubled[seam-n//2:seam+n//2])
        adjacent = [rms(doubled[seam-3*n//2:seam-n//2]),rms(doubled[seam+n//2:seam+3*n//2])]
        db = [float(20*np.log10(center/v)) for v in adjacent]
        self.assertTrue(all(abs(v)<=6 for v in db),db)
        data = json.loads(peaks.read_text())
        self.assertEqual(len(data['peaks']),320)
        self.assertEqual(data['pickupBeats'],0)
        self.assertTrue(all(0<=p<=1 for p in data['peaks']))
        self.assertEqual(json.loads(stdout.splitlines()[-1])['loop'],True)
        for file in (self.path/'stems').glob('*.wav'):
            self.assertEqual(wavfile.read(file)[1].shape,x.shape)

    def test_nonloop_and_errors(self):
        out=self.path/'template.wav'
        self.run_render('-m','engine.render','scores/template_150.py','--out',str(out),'--plucks','scores/plucks_example.csv')
        sr,x=wavfile.read(out)
        self.assertEqual(len(x),round(17.6*sr))
        p=subprocess.run([sys.executable,'-m','engine.render','missing.py','--out',str(out)],cwd=ROOT,capture_output=True,text=True)
        self.assertNotEqual(p.returncode,0)
        self.assertIn('渲染失败',p.stderr)

if __name__ == '__main__':
    unittest.main()
