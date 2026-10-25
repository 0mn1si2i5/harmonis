"""滤波、包络与效果；渲染上下文由调用方传入。"""

import numpy as np
import scipy.signal as ss

def mtof(m, *, sample_rate=48000, rng=None, length=None):
    return 440.0 * 2.0 ** ((m - 69) / 12.0)

def tt(dur, *, sample_rate=48000, rng=None, length=None):
    return np.arange(int(round(dur * sample_rate))) / sample_rate

def bq(kind, fc, q=0.707, *, sample_rate=48000, rng=None, length=None):
    fc = float(np.clip(fc, 20.0, sample_rate * 0.45))
    w = 2 * np.pi * fc / sample_rate
    c, s = (np.cos(w), np.sin(w))
    al = s / (2 * q)
    if kind == 'lp':
        b = [(1 - c) / 2, 1 - c, (1 - c) / 2]
    elif kind == 'hp':
        b = [(1 + c) / 2, -(1 + c), (1 + c) / 2]
    else:
        b = [al, 0.0, -al]
    a = [1 + al, -2 * c, 1 - al]
    return (np.array(b) / a[0], np.array(a) / a[0])

def filt(x, kind, fc, q=0.707, *, sample_rate=48000, rng=None, length=None):
    b, a = bq(kind, fc, q, sample_rate=sample_rate, rng=rng, length=length)
    return ss.lfilter(b, a, x)

def tvf(x, kind, fc, q=0.707, block=64, *, sample_rate=48000, rng=None, length=None):
    """随时间变的双二阶滤波：每 block 个采样换一次系数，状态接着用。"""
    y = np.empty_like(x)
    zi = np.zeros(2)
    for s in range(0, len(x), block):
        b, a = bq(kind, fc[min(s, len(fc) - 1)], q, sample_rate=sample_rate, rng=rng, length=length)
        y[s:s + block], zi = ss.lfilter(b, a, x[s:s + block], zi=zi)
    return y

def blep_saw(freq, phase0=None, *, sample_rate=48000, rng=None, length=None):
    dt = freq / sample_rate
    p0 = rng.random() if phase0 is None else phase0
    ph = (np.cumsum(dt) + p0) % 1.0
    y = 2 * ph - 1
    m = ph < dt
    t = ph[m] / dt[m]
    y[m] -= t + t - t * t - 1
    m = ph > 1 - dt
    t = (ph[m] - 1) / dt[m]
    y[m] -= t * t + t + t + 1
    return y

def ad(n, a, d, *, sample_rate=48000, rng=None, length=None):
    t = np.arange(n) / sample_rate
    return np.minimum(1.0, t / max(a, 0.0001)) * np.exp(-np.maximum(0.0, t - a) / d)

def held(n, dur, rel, *, sample_rate=48000, rng=None, length=None):
    t = np.arange(n) / sample_rate
    return np.where(t < dur, 1.0, np.exp(-(t - dur) / rel))

def noise(n, *, sample_rate=48000, rng=None, length=None):
    return rng.standard_normal(n)

def make_ir(rt60=2.0, pre=0.014, *, sample_rate=48000, rng=None, length=None):
    n = int(rt60 * 1.3 * sample_rate)
    t = np.arange(n) / sample_rate
    irs = []
    for _ in range(2):
        w = noise(n, sample_rate=sample_rate, rng=rng, length=length)
        bright = filt(w, 'lp', 6500, sample_rate=sample_rate, rng=rng, length=length)
        dark = filt(w, 'lp', 1400, sample_rate=sample_rate, rng=rng, length=length) * 1.7
        k = np.clip(t / rt60, 0, 1)
        ir = (bright * (1 - k) + dark * k) * np.exp(-6.9 * t / rt60)
        ir = np.concatenate([np.zeros(int(pre * sample_rate)), ir])
        irs.append(ir / np.sqrt(np.sum(ir ** 2)))
    return irs

def reverb(x, rt60=2.0, hp=250, *, sample_rate=48000, rng=None, length=None):
    irs = make_ir(rt60, sample_rate=sample_rate, rng=rng, length=length)
    y = np.zeros_like(x)
    for c in range(2):
        src = filt(x[c], 'hp', hp, sample_rate=sample_rate, rng=rng, length=length)
        y[c] = ss.fftconvolve(src, irs[c])[:x.shape[1]]
    return y

def pingpong(x, delay, fb=0.4, taps=7, lp=4500, *, sample_rate=48000, rng=None, length=None):
    d = int(round(delay * sample_rate))
    y = np.zeros_like(x)
    mono = filt(0.5 * (x[0] + x[1]), 'lp', lp, sample_rate=sample_rate, rng=rng, length=length)
    for k in range(1, taps + 1):
        g = fb ** (k - 1)
        c = (k - 1) % 2
        
        if k * d < x.shape[1]:
            y[c, k * d:] += g * mono[:x.shape[1] - k * d]
    return y

def duck(kick_times, depth, rel=0.13, *, sample_rate=48000, rng=None, length=None):
    g = np.ones(length)
    n = int(0.45 * sample_rate)
    t = np.arange(n) / sample_rate
    shape = depth * np.exp(-t / rel) * np.minimum(1.0, t / 0.003 + 0.2)
    for tk in kick_times:
        i = int(round(tk * sample_rate))
        a, b = (max(0, i), min(length, i + n))
        if b > a:
            g[a:b] = np.minimum(g[a:b], 1 - shape[a - i:b - i])
    return g