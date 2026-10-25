"""默认混音；有状态效果完成后才折回循环尾巴。"""
import numpy as np
from functools import partial
from . import dsp

def mix(song):
    duck = partial(dsp.duck, sample_rate=song.sample_rate, length=song.length)
    filt = partial(dsp.filt, sample_rate=song.sample_rate)
    buses = {k:b.x.copy() for k,b in song.buses.items()}
    g_music = duck(song.kicks, .35)
    # 先处理侧链，后续统一折叠带效果的尾巴。
    buses['bass'] *= duck(song.kicks,.55)
    buses['keys'] *= duck(song.kicks,.2)
    buses['synth'] *= g_music
    drums,bass,keys,synth,lead,fx,plucks = [buses[n] for n in ('drums','bass','keys','synth','lead','fx','plucks')]
    lead_wet = dsp.pingpong(lead,.75*song.beat,.38,sample_rate=song.sample_rate,length=song.length)*.35
    send = .18*drums+.35*keys+.3*synth+.35*lead+.2*fx+.35*plucks
    wet = dsp.reverb(send,2.,sample_rate=song.sample_rate,rng=song.rng)*g_music
    # 效果另作分轨，分轨之和是母带处理前的混音。
    buses['effects'] = lead_wet*g_music+wet*.55
    m = sum(buses.values())
    m = np.vstack([filt(m[0],'hp',28),filt(m[1],'hp',28)])
    m = song.fold(m)
    peak = np.max(np.abs(m))
    if peak:
        m /= peak
    m = np.tanh(1.8*m)/np.tanh(1.8)
    if not song.loop:
        fade0 = round((song.T(song.bars)+2.)*song.sample_rate)
        k = np.clip((np.arange(song.length)-fade0)/max(1,song.length-fade0),0,1)
        m *= np.cos(k*np.pi/2)**2
    peak = np.max(np.abs(m))
    if peak:
        m *= 10**(-1/20)/peak
    return m, {n:song.fold(x) for n,x in buses.items()}
