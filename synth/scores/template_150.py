"""150 BPM 新曲模板，Lofi 和弦八小节

和弦 Dm9 G13 Cmaj9 Am9 Fmaj9 Em9 Dm9 G13，动机 A G E D E G。--loop 时去掉两拍弱起。
"""
from engine.harmony import CH, LOFI_LOOP, MOTIF
from engine.instruments import Instruments
SONG = dict(bpm=150, bars=8, pickup_beats=2, tail=4, seed=20261020)

def arrange(song, plucks):
    i = Instruments(song)
    if song.pickup_beats:
        song.keys.add(i.tine(69,.3,.5),0,.3)
        song.keys.add(i.tine(67,.3,.5),song.beat,.3)
    for bar in range(1,song.bars+1):
        root, chord = CH[LOFI_LOOP[(bar-1)%8]]
        for beat in range(song.beats_per_bar):
            t = song.T(bar,beat)
            song.drums.add(i.kick(),t,.5)
            song.kicks.append(t)
            song.bass.add(i.sub(root+12,song.beat*.8),t,.4)
            if beat % 2:
                song.drums.add(i.snare(),t,.35)
            for half in (0,.5):
                song.drums.add(i.hat(),t+half*song.beat,.09)
        for beat in (0,1.5,3):
            i.rhodes_chord(song.keys,chord,song.T(bar,beat),song.beat*1.5,.6,.7)
        for k,beat in enumerate((.5,1,1.5,2.5,3,3.5)):
            song.lead.add(i.lead(MOTIF[k]+12,.3*song.beat,.6),song.T(bar,beat),.16)
    for t,m,vel in plucks:
        song.plucks.add(i.pluck(m,.35,vel),t,.6)
