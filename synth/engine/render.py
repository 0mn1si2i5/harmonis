"""供网页子进程调用的 WAV 渲染入口。"""
import argparse
import json
import runpy
import sys
from pathlib import Path
import numpy as np
from scipy.io import wavfile
from .song import Song
from .plucks import parse, notes
from .mix import mix

def write_wav(path, sr, x):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    wavfile.write(str(path), sr, (np.clip(x.T,-1,1)*32767).astype(np.int16))

class ChineseParser(argparse.ArgumentParser):
    def error(self, message):
        self.exit(2, "参数错误：请检查曲谱路径、输出路径及命令行选项\n")

def main():
    p = ChineseParser(description='合成编曲渲染')
    p.add_argument('score'); p.add_argument('--out',required=True)
    p.add_argument('--plucks'); p.add_argument('--peaks'); p.add_argument('--stems')
    group = p.add_mutually_exclusive_group()
    group.add_argument('--loop',dest='loop',action='store_true')
    group.add_argument('--no-loop',dest='loop',action='store_false')
    p.set_defaults(loop=None)
    p.add_argument('--bars',type=int); p.add_argument('--seed',type=int)
    args = p.parse_args()
    try:
        score = runpy.run_path(args.score)
        config = dict(score['SONG'])
        for key in ('loop','bars','seed'):
            if getattr(args,key) is not None:
                config[key] = getattr(args,key)
        # 命令行切换循环时移除曲谱弱起，直接试听同一编曲的周期版本。
        if args.loop is True:
            config['pickup_beats'] = 0
        song = Song(**config)
        events = notes(song,parse(Path(args.plucks).read_text(encoding='utf-8-sig'))) if args.plucks else []
        score['arrange'](song,events)
        m, stems = mix(song)
        write_wav(args.out,song.sample_rate,m)
        if args.stems:
            for name,x in stems.items():
                write_wav(Path(args.stems)/(name+'.wav'),song.sample_rate,x)
        if args.peaks:
            hop = max(1,round(song.sample_rate*.01))
            peaks = np.maximum.reduceat(np.max(np.abs(m),axis=0),np.arange(0,m.shape[1],hop)).tolist()
            data = dict(sampleRate=song.sample_rate,duration=m.shape[1]/song.sample_rate,bpm=song.bpm,
                        beatsPerBar=song.beats_per_bar,pickupBeats=song.pickup_beats,bars=song.bars,loop=song.loop,peaks=peaks)
            Path(args.peaks).parent.mkdir(parents=True,exist_ok=True)
            Path(args.peaks).write_text(json.dumps(data),encoding='utf-8')
        if song.loop:
            n = max(1,round(song.sample_rate*.02))
            print('循环接缝 '+json.dumps(dict(sampleDifference=float(np.max(np.abs(m[:,0]-m[:,-1]))),
                beforeRMS=float(np.sqrt(np.mean(m[:,-n:]**2))),afterRMS=float(np.sqrt(np.mean(m[:,:n]**2))))))
        peak = float(np.max(np.abs(m)))
        print(json.dumps(dict(file=str(Path(args.out)),duration=m.shape[1]/song.sample_rate,
                             peakDBFS=20*np.log10(peak) if peak else None,loop=song.loop)))
        return 0
    except Exception as e:
        print('渲染失败：'+str(e).replace('\n',' '),file=sys.stderr)
        return 1

if __name__ == '__main__':
    sys.exit(main())
