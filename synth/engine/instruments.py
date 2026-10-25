"""原曲音色；每个实例使用所属 Song 的采样率和随机源。"""

import numpy as np
import scipy.signal as ss
from functools import partial
from . import dsp

HAT_F = np.array([205.3,304.4,369.6,522.7,540.,800.])*1.6

class Instruments:
    def __init__(self, song):
        self.sample_rate = song.sample_rate
        self.rng = song.rng
        self.beat = song.beat
        for name in ['mtof', 'tt', 'bq', 'filt', 'tvf', 'blep_saw', 'ad', 'held', 'noise', 'make_ir', 'reverb', 'pingpong', 'duck']:
            setattr(self, name, partial(getattr(dsp, name), sample_rate=song.sample_rate, rng=song.rng, length=song.length))

    def kick(self, hard=False):
        t = self.tt(0.55)
        f = 50 + (140 if hard else 115) * np.exp(-t / 0.032) + 280 * np.exp(-t / 0.004)
        body = np.sin(2 * np.pi * np.cumsum(f) / self.sample_rate) * np.exp(-t / (0.26 if hard else 0.17))
        click = self.filt(self.noise(len(t)), 'hp', 2500) * np.exp(-t / 0.004) * 0.4
        x = (body + click) * np.minimum(1.0, t / 0.0012)
        d = 2.6 if hard else 2.0
        return np.tanh(d * x) / np.tanh(d)

    def snare(self, tone=190.0, clap=True):
        t = self.tt(0.4)
        f = tone * (1 + 0.6 * np.exp(-t / 0.012))
        body = np.sin(2 * np.pi * np.cumsum(f) / self.sample_rate) * np.exp(-t / 0.06)
        hiss = self.filt(self.filt(self.noise(len(t)), 'hp', 1200), 'lp', 9000) * np.exp(-t / 0.11)
        x = 0.6 * body + 0.55 * hiss
        if clap:
            env = np.zeros(len(t))
            for k, t0 in enumerate((0.0, 0.009, 0.019, 0.03)):
                on = t >= t0
                env[on] += np.exp(-(t[on] - t0) / (0.006 if k < 3 else 0.12))
            x += 0.65 * self.filt(self.noise(len(t)), 'bp', 1500, 0.9) * env
        return np.tanh(1.6 * x)

    def metal(self, n):
        t = np.arange(n) / self.sample_rate
        return sum((np.sign(np.sin(2 * np.pi * f * t + self.rng.random() * 6.3)) for f in HAT_F)) / 6

    def hat(self, open_=False):
        n = int((0.45 if open_ else 0.08) * self.sample_rate)
        x = 0.7 * self.metal(n) + 0.6 * self.noise(n)
        x = self.filt(self.filt(x, 'hp', 7200), 'hp', 7200)
        return x * self.ad(n, 0.0008, 0.14 if open_ else 0.02)

    def crash(self, dur=2.8):
        out = []
        for _ in range(2):
            n = int(dur * self.sample_rate)
            x = 0.8 * self.metal(n) + self.noise(n)
            x = self.filt(self.filt(x, 'hp', 3500), 'lp', 14000)
            out.append(x * self.ad(n, 0.001, 0.75))
        return np.vstack(out)

    def rev_crash(self, dur):
        c = self.crash(dur + 0.4)
        return c[:, ::-1][:, int(0.4 * self.sample_rate):] * 0.9

    def roll(self, bus, t0, t1, rate0, rate1, v0, v1, tone0=190, tone1=330, gain=1.0):
        """军鼓滚奏：从 rate0 到 rate1 次每拍，力度和音高一起往上走。"""
        t = t0
        while t < t1 - 1e-06:
            k = (t - t0) / (t1 - t0)
            rate = rate0 * (rate1 / rate0) ** k
            bus.add(self.snare(tone0 + (tone1 - tone0) * k, clap=False) * (v0 + (v1 - v0) * k), t, gain, pan=0.15 * np.sin(t * 9))
            t += self.beat / rate

    def sub(self, m, dur):
        t = self.tt(dur + 0.08)
        x = np.sin(2 * np.pi * self.mtof(m) * t)
        x = np.tanh(1.4 * x) * self.held(len(t), dur, 0.02) * np.minimum(1.0, t / 0.004)
        return x * 0.6

    def pluck_bass(self, m, dur, bright=1.0):
        n = int((dur + 0.06) * self.sample_rate)
        f = np.full(n, self.mtof(m))
        x = 0.6 * self.blep_saw(f) + 0.4 * self.blep_saw(f * 1.004)
        t = np.arange(n) / self.sample_rate
        fc = 180 + bright * 2400 * np.exp(-t / 0.07)
        x = self.tvf(x, 'lp', fc, q=1.4)
        x = np.tanh(1.8 * x) * self.held(n, dur, 0.015) * np.minimum(1.0, t / 0.002)
        return x

    def impact(self, bus, t, big=True):
        n = int(2.6 * self.sample_rate)
        tm = np.arange(n) / self.sample_rate
        f = 34 + 50 * np.exp(-tm / 0.35)
        boom = np.sin(2 * np.pi * np.cumsum(f) / self.sample_rate) * np.exp(-tm / (0.9 if big else 0.5))
        thud = self.filt(self.noise(n), 'lp', 220) * np.exp(-tm / 0.18) * 1.6
        bus.add(np.tanh(1.5 * (boom + thud)), t, 0.65 if big else 0.45)

    def tine(self, m, dur, vel, det=0.0):
        """电钢琴：调频的音叉声，和游戏里的电钢琴一个路数。"""
        n = int((dur + 0.9) * self.sample_rate)
        t = np.arange(n) / self.sample_rate
        f = self.mtof(m) * (1 + det)
        idx = (0.5 + 2.4 * vel) * np.exp(-t / 0.32)
        x = np.sin(2 * np.pi * f * t + idx * np.sin(2 * np.pi * f * t))
        if f * 13.9 < 16000:
            x += 0.18 * vel * np.sin(2 * np.pi * f * 13.9 * t) * np.exp(-t / 0.025)
        env = np.exp(-t / 2.0) * self.held(n, dur, 0.14) * np.minimum(1.0, t / 0.0015)
        return x * env * vel

    def rhodes_chord(self, bus, notes, t, dur, vel, gain=1.0):
        for k, m in enumerate(notes):
            st = t + 0.006 * k
            l = self.tine(m, dur, vel, -0.0015)
            r = self.tine(m, dur, vel, +0.0015)
            trem = 1 + 0.18 * np.sin(2 * np.pi * 3.6 * (np.arange(len(l)) / self.sample_rate) + np.array([[0.0], [np.pi]]))
            bus.add(np.vstack([l, r]) * trem, st, gain * 0.45)

    def supersaw(self, notes, dur, fc0, fc1, fdec, rel=0.12, voices=7, spread=0.012, attack=0.003, n_extra=0.35):
        n = int((dur + n_extra) * self.sample_rate)
        t = np.arange(n) / self.sample_rate
        out = np.zeros((2, n))
        for m in notes:
            for v in range(voices):
                d = (v - (voices - 1) / 2) / ((voices - 1) / 2)
                f = np.full(n, self.mtof(m) * (1 + spread * d * (0.6 + 0.4 * self.rng.random())))
                x = self.blep_saw(f)
                pan = d * 0.85
                out[0] += x * min(1.0, 1 - pan)
                out[1] += x * min(1.0, 1 + pan)
        fc = fc1 + (fc0 - fc1) * np.exp(-t / fdec) if fdec > 0 else np.full(n, fc0)
        env = self.held(n, dur, rel) * np.minimum(1.0, t / attack)
        for c in range(2):
            out[c] = self.tvf(out[c], 'lp', fc, q=0.9) * env
        return out / (len(notes) * voices) * 3.0

    def swell(self, notes, dur, fc0, fc1):
        """铺底：滤波从 fc0 慢慢打开到 fc1，音量渐强。"""
        n = int((dur + 0.3) * self.sample_rate)
        t = np.arange(n) / self.sample_rate
        x = self.supersaw(notes, dur, fc0, fc0, 0, rel=0.08, attack=0.05, n_extra=0.3)
        k = np.clip(t / dur, 0, 1)
        fc = fc0 * (fc1 / fc0) ** k
        x = np.vstack([self.tvf(x[0], 'lp', fc, 1.2), self.tvf(x[1], 'lp', fc, 1.2)])
        return x * (0.25 + 0.75 * k ** 1.5)

    def bell(self, m, vel=1.0):
        """琶音用的短铃：阻尼正弦加一个八度泛音。"""
        t = self.tt(0.32)
        f = self.mtof(m)
        x = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * 2.005 * f * t) * np.exp(-t / 0.04)
        return x * self.ad(len(t), 0.001, 0.09) * vel

    def lead(self, m, dur, vel=1.0, glide_from=None):
        n = int((dur + 0.25) * self.sample_rate)
        t = np.arange(n) / self.sample_rate
        f = np.full(n, self.mtof(m))
        if glide_from is not None:
            f = self.mtof(m) + (self.mtof(glide_from) - self.mtof(m)) * np.exp(-t / 0.025)
        vib = 1 + 0.006 * np.sin(2 * np.pi * 5.6 * t) * np.clip((t - 0.18) / 0.2, 0, 1)
        f = f * vib
        x = 0.5 * self.blep_saw(f * 1.003) + 0.5 * self.blep_saw(f * 0.997)
        sq = self.blep_saw(f * 0.5, 0.0) - self.blep_saw(f * 0.5, 0.5)
        x = x + 0.35 * sq
        fc = 1800 + 3800 * np.exp(-t / 0.18)
        x = self.tvf(x, 'lp', fc, q=1.0)
        env = self.held(n, dur, 0.06) * np.minimum(1.0, t / 0.004) * (0.85 + 0.15 * np.exp(-t / 0.1))
        return x * env * vel

    def riser(self, dur, f0=300.0, f1=9000.0):
        n = int(dur * self.sample_rate)
        t = np.arange(n) / self.sample_rate
        k = t / dur
        fc = f0 * (f1 / f0) ** k
        out = []
        for _ in range(2):
            x = self.tvf(self.noise(n), 'bp', fc, q=1.6)
            out.append(x)
        tone_f = 220 * 8.0 ** k ** 1.6
        tone = 0.25 * self.blep_saw(tone_f)
        tone = self.filt(tone, 'lp', 5000)
        amp = k ** 2.2
        return np.vstack([out[0] + tone, out[1] + tone]) * amp

    def pluck(self, m, dur, vel=1.0):
        # 梳状反馈的双抽头平均让高频逐次衰减，避免逐采样 Python 循环。
        n = max(1, int((dur + 0.3) * self.sample_rate))
        period = max(2, int(round(self.sample_rate / self.mtof(m) - 0.5)))
        excitation = np.zeros(n)
        excitation[:min(period, n)] = self.noise(min(period, n))
        a = np.zeros(period + 2)
        a[0] = 1
        a[period:period+2] = -0.495
        x = ss.lfilter([1.0], a, excitation)
        x *= self.held(n, dur, 0.06) * np.minimum(1, np.arange(n) / max(1, self.sample_rate * 0.001))
        return x * vel * 0.5
