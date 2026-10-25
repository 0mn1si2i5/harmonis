"""曲目时间轴和可扩展的立体声总线。"""
import numpy as np

class Bus:
    def __init__(self, song):
        self.song = song
        self.x = np.zeros((2, song.length))

    def add(self, sig, t, gain=1.0, pan=0.0):
        sig = np.asarray(sig)
        if sig.ndim == 1:
            sig = np.vstack([sig * min(1., 1.-pan), sig * min(1., 1.+pan)])
        i = int(round(t * self.song.sample_rate))
        a, b = max(0, i), min(self.song.length, i + sig.shape[1])
        if b > a:
            self.x[:, a:b] += gain * sig[:, a-i:b-i]

class Song:
    def __init__(self, bpm, bars, beats_per_bar=4, pickup_beats=0, tail=4,
                 loop=False, sample_rate=48000, seed=20261020):
        if bpm <= 0 or bars <= 0 or int(bars) != bars or beats_per_bar <= 0 or tail < 0 or pickup_beats < 0 or sample_rate <= 0 or int(sample_rate) != sample_rate:
            raise ValueError('速度、小节数和采样率须为正数，尾巴和弱起不能为负')
        if loop and pickup_beats:
            raise ValueError('循环模式的 pickup_beats 必须为 0')
        self.bpm, self.bars, self.beats_per_bar = bpm, int(bars), beats_per_bar
        self.pickup_beats, self.tail, self.loop = pickup_beats, tail, loop
        self.sample_rate, self.seed = int(sample_rate), seed
        self.beat = 60.0 / bpm
        if loop and abs(self.beat * sample_rate - round(self.beat * sample_rate)) > 1e-8:
            raise ValueError('循环模式要求每拍采样数是整数，请调整速度或采样率')
        self.cycle_samples = int(round(bars * beats_per_bar * self.beat * sample_rate))
        self.length = int(round(((bars * beats_per_bar + pickup_beats) * self.beat + tail) * sample_rate))
        self.rng = np.random.default_rng(seed)
        self.kicks = []
        self.buses = {}
        for name in ('drums','bass','keys','synth','lead','fx','plucks'):
            self.bus(name)

    def T(self, bar, beat=0):
        return (self.pickup_beats + (bar-1) * self.beats_per_bar + beat) * self.beat

    def bus(self, name):
        if name not in self.buses:
            self.buses[name] = Bus(self)
        return self.buses[name]

    def __getattr__(self, name):
        buses = self.__dict__.get('buses', {})
        if name in buses:
            return buses[name]
        raise AttributeError(name)

    def fold(self, x):
        if not self.loop:
            return x.copy()
        out = np.zeros((2, self.cycle_samples))
        for start in range(0, x.shape[1], self.cycle_samples):
            chunk = x[:, start:start+self.cycle_samples]
            out[:, :chunk.shape[1]] += chunk
        return out
