"""宣传片编曲示例，150 BPM 23 小节"""
import numpy as np
from engine.harmony import CH, LOFI_LOOP, Plan
from engine.instruments import Instruments
PLAN = {}
for i, c in enumerate(LOFI_LOOP):
    PLAN[1 + i] = [(0, c)]
    PLAN[10 + i] = [(0, c)]
PLAN[9] = [(0, 'Bbmaj9'), (2, 'C69')]
PLAN[18] = [(0, 'Cmaj9')]
PLAN[19] = [(0, 'Am9')]
PLAN[20] = [(0, 'Fmaj9')]
PLAN[21] = [(0, 'Em9')]
PLAN[22] = [(0, 'Dm9'), (2, 'G13')]
PLAN[23] = [(0, 'Cmaj9')]


PLAN = Plan(PLAN)
chord_at = PLAN.chord_at
SONG = dict(bpm=150, bars=23, sample_rate=44100, tail=4, seed=20261020)

def arrange(song, plucks):
    T, BEAT = song.T, song.beat
    drums, bass, keys, synth, lead_bus, fx = [song.bus(n) for n in ("drums", "bass", "keys", "synth", "lead", "fx")]
    kicks = song.kicks
    instruments = Instruments(song)
    kick = instruments.kick
    snare = instruments.snare
    metal = instruments.metal
    hat = instruments.hat
    crash = instruments.crash
    rev_crash = instruments.rev_crash
    roll = instruments.roll
    sub = instruments.sub
    pluck_bass = instruments.pluck_bass
    impact = instruments.impact
    tine = instruments.tine
    rhodes_chord = instruments.rhodes_chord
    supersaw = instruments.supersaw
    swell = instruments.swell
    bell = instruments.bell
    lead = instruments.lead
    riser = instruments.riser
    def K(bar, beat, hard=False, g=1.0):
        drums.add(kick(hard), T(bar, beat), 0.95 * g)
        kicks.append(T(bar, beat))

    def S(bar, beat, g=1.0, clap=True):
        drums.add(snare(clap=clap), T(bar, beat), 0.62 * g, pan=0.05)

    def H(bar, beat, g=1.0, open_=False):
        drums.add(hat(open_), T(bar, beat), (0.2 if open_ else 0.17) * g,
                  pan=0.25 if int(beat * 4) % 2 else -0.15)

    def CR(bar, beat=0.0, g=1.0):
        drums.add(crash(), T(bar, beat), 0.32 * g)

    # 1–8：碎拍
    for bar in range(1, 9):
        late = bar >= 5
        K(bar, 0, hard=(bar == 1))
        K(bar, 2.5)
        if bar % 2 == 0:
            K(bar, 1.5, g=0.7)
        S(bar, 1)
        S(bar, 3)
        if late:
            S(bar, 1.75, 0.22, clap=False)
            S(bar, 3.75, 0.25, clap=False)
        for s in range(16):
            b = s / 4
            if b == 3.5 and late:
                H(bar, b, 1.0, open_=True)
                continue
            acc = 1.0 if s % 4 == 0 else (0.75 if s % 2 == 0 else 0.45)
            H(bar, b, acc * (1.0 if late else 0.8))
    impact(fx, T(1), big=False)
    CR(1)
    fx.add(rev_crash(T(7) - T(6, 2)), T(6, 2), 0.35)
    CR(7, 0, 0.9)
    CR(5, 0, 0.6)
    # 第 8 小节最后一拍过门
    for k in range(4):
        S(8, 3 + k * 0.25, 0.35 + 0.15 * k, clap=False)

    # 9：鼓停，起量
    K(9, 0, g=0.8)
    roll(drums, T(9, 1), T(9, 3.5), 2, 8, 0.12, 0.55)
    fx.add(riser(T(10) - T(9) - BEAT * 0.5), T(9), 0.35)

    # 10–17：混剪
    for bar in range(10, 18):
        dense = bar >= 14
        for b in range(4):
            if bar == 17 and b >= 3:
                break
            K(bar, b, hard=(bar == 10 and b == 0))
        S(bar, 1)
        S(bar, 3)
        if dense and bar < 17:
            S(bar, 0, 0.35, clap=False)
            S(bar, 2, 0.35, clap=False)
        for s in range(16):
            b = s / 4
            if bar == 17 and b >= 3.5:
                break
            if s % 4 == 2:
                H(bar, b, 1.0, open_=True)
            else:
                H(bar, b, 1.0 if s % 2 == 0 else 0.55)
        if bar in (10, 12, 14, 16):
            CR(bar, 0, 1.0 if bar in (10, 14) else 0.75)
    impact(fx, T(10))
    roll(drums, T(17, 0), T(17, 3.5), 4, 16, 0.2, 0.9, gain=0.9)
    fx.add(riser(T(18) - T(17) - BEAT * 0.5, 400, 12000), T(17), 0.45)
    fx.add(rev_crash(T(18) - T(17, 1)), T(17, 1), 0.45)

    # 18–19：LOGO 重击
    K(18, 0, hard=True, g=1.1)
    impact(fx, T(18))
    CR(18, 0, 1.2)
    drums.add(crash(), T(18, 0.01), 0.25, pan=0.3)
    for b in (0.5, 1.5, 2.5, 3.5):
        H(18, b, 0.6)
    for b in range(4):
        K(19, b)
    S(19, 1)
    S(19, 3)
    for s in range(16):
        H(19, s / 4, 1.0 if s % 4 == 2 else (0.9 if s % 2 == 0 else 0.5), open_=(s % 4 == 2))
    for k in range(4):
        S(19, 3 + k * 0.25, 0.3 + 0.12 * k, clap=False)

    # 20–23：半速收尾
    for bar in range(20, 23):
        K(bar, 0)
        K(bar, 2.5, g=0.8)
        S(bar, 2)
        for s in range(8):
            H(bar, s / 2, 0.8 if s % 2 == 0 else 0.5)
    for k in range(3):
        S(22, 3.25 + k * 0.25, 0.3 + 0.15 * k, clap=False)
    CR(20, 0, 0.7)
    K(23, 0, hard=True)
    CR(23, 0, 1.0)

    # --- 低音 ---
    verse_bass = [(0, 0, 1.0, 1.0), (1.5, 12, 0.5, 0.8), (2.5, 0, 0.5, 0.9), (3.0, 7, 0.5, 0.7), (3.5, 12, 0.4, 0.75)]
    for bar in range(1, 9):
        for b, iv, d, v in verse_bass:
            root = CH[chord_at(bar, b)][0]
            bass.add(pluck_bass(root + 12 + iv, d * BEAT, 0.7), T(bar, b), 0.32 * v)
            if iv == 0:
                bass.add(sub(root + 12, d * BEAT), T(bar, b), 0.5 * v)
    for b, c in PLAN[9]:
        root = CH[c][0]
        bass.add(sub(root + 12, 2 * BEAT - 0.02), T(9, b), 0.3)
        bass.add(pluck_bass(root + 12, 2 * BEAT - 0.02, 0.4), T(9, b), 0.22)
    for bar in list(range(10, 18)) + [19]:
        for s in range(8):
            b = s / 2
            if bar == 17 and b >= 3.5:
                break
            root = CH[chord_at(bar, b)][0]
            oct_ = 24 if s % 2 else 12
            bass.add(pluck_bass(root + oct_, 0.45 * BEAT, 1.0 if s % 2 else 0.7), T(bar, b), 0.3)
        for b in range(4):
            if bar == 17 and b >= 3:
                break
            root = CH[chord_at(bar, b)][0]
            bass.add(sub(root + 12, BEAT * 0.95), T(bar, b), 0.55)
    bass.add(sub(36 + 12, 4 * BEAT), T(18), 0.6)
    bass.add(pluck_bass(36 + 12, 1.2 * BEAT, 1.2), T(18), 0.35)
    for bar in range(20, 23):
        for b, c in PLAN[bar]:
            root = CH[c][0]
            span = (4 if len(PLAN[bar]) == 1 else 2) * BEAT
            bass.add(sub(root + 12, span - 0.03), T(bar, b), 0.5)
            bass.add(pluck_bass(root + 12, 0.8 * BEAT, 0.5), T(bar, b), 0.25)
            bass.add(pluck_bass(root + 24, 0.4 * BEAT, 0.5), T(bar, b + 1.5), 0.15)
    bass.add(sub(36 + 12, 3.0), T(23), 0.55)
    bass.add(pluck_bass(36 + 12, 1.5, 0.6), T(23), 0.25)

    # --- 电钢琴 ---
    comp_a = [(0.0, 0.5, 0.75), (1.5, 0.4, 0.6), (3.0, 0.6, 0.7)]
    comp_b = [(0.5, 0.4, 0.6), (1.5, 0.4, 0.55), (2.75, 0.5, 0.7), (3.5, 0.4, 0.55)]
    for bar in range(1, 9):
        for b, d, v in (comp_a if bar % 2 else comp_b):
            rhodes_chord(keys, CH[chord_at(bar, b)][1], T(bar, b), d * BEAT, v)
    for b, c in PLAN[9]:
        rhodes_chord(keys, CH[c][1], T(9, b), 2 * BEAT, 0.5, 0.8)
    for bar in list(range(10, 18)) + [19]:
        for b, d, v in comp_b:
            if bar == 17 and b >= 3:
                continue
            rhodes_chord(keys, CH[chord_at(bar, b)][1], T(bar, b), d * BEAT, v * 0.8, 0.7)
    rhodes_chord(keys, [48] + CH['Cmaj9'][1] + [71], T(18), 4 * BEAT, 0.95)
    for bar in range(20, 23):
        for b, c in PLAN[bar]:
            span = 4 if len(PLAN[bar]) == 1 else 2
            rhodes_chord(keys, CH[c][1], T(bar, b), span * BEAT * 0.9, 0.7)
            if span == 4:
                rhodes_chord(keys, CH[c][1], T(bar, b + 2.5), 1.2 * BEAT, 0.45)
    rhodes_chord(keys, [48] + CH['Cmaj9'][1] + [69, 74], T(23), 3.0, 0.8)

    # --- 琶音（5–8 轻，10–17 满） ---
    arp_bars = list(range(5, 9)) + list(range(10, 18)) + [19]
    for bar in arp_bars:
        for s in range(16):
            b = s / 4
            if bar == 17 and b >= 3.5:
                break
            notes = CH[chord_at(bar, b)][1]
            order = [0, 1, 2, 3, 2, 1] if bar % 2 else [0, 2, 1, 3]
            m = notes[order[s % len(order)]] + 24
            v = 0.5 if bar < 9 else 0.8
            synth.add(bell(m, v * (1.0 if s % 4 == 0 else 0.7)), T(bar, b), 0.16,
                      pan=-0.5 if s % 2 else 0.5)

    # --- 锯齿和弦 ---
    stab_a = [(0.0, 0.5), (0.75, 0.25), (2.0, 0.5), (2.75, 0.25)]   # 10–13：两拍一重音
    stab_b = [(0.0, 0.4), (1.0, 0.4), (2.0, 0.4), (3.0, 0.4)]       # 14–16：每拍一重音
    for bar in range(10, 17):
        for b, d in (stab_a if bar < 14 else stab_b):
            notes = CH[chord_at(bar, b)][1]
            synth.add(supersaw([m + 12 for m in notes], d * BEAT, 7000, 900, 0.09), T(bar, b), 1.2)
    for b in (0.0, 1.0, 2.0):
        notes = CH['G13'][1]
        synth.add(supersaw([m + 12 for m in notes], 0.4 * BEAT, 7500, 900, 0.09), T(17, b), 1.2)
    synth.add(swell([m + 12 for m in CH['G13'][1]], T(18) - T(17, 3) - 0.02, 400, 6000), T(17, 3), 0.9)
    synth.add(supersaw([m + 12 for m in CH['Cmaj9'][1]] + [48, 60], 4 * BEAT, 9000, 1300, 0.5, rel=0.5),
              T(18), 1.3)
    for b, d in stab_a:
        synth.add(supersaw([m + 12 for m in CH[chord_at(19, b)][1]], d * BEAT, 7000, 900, 0.09), T(19, b), 1.1)
    for b, c in PLAN[9]:
        synth.add(swell([m + 12 for m in CH[c][1]], 2 * BEAT - 0.02, 300 if b == 0 else 900,
                        900 if b == 0 else 5000), T(9, b), 1.0)
    synth.add(supersaw([m + 12 for m in CH['Cmaj9'][1]], 3.0, 3000, 900, 1.2, rel=1.0, attack=0.02),
              T(23), 0.6)

    # --- 主旋律：Lofi 的 A G E D E G，加快以后放到高八度 ---
    hook = [(0.0, 81, 0.5), (0.75, 79, 0.5), (1.5, 76, 1.0), (3.0, 74, 0.5), (3.5, 76, 0.5),
            (4.0, 79, 1.75), (6.0, 81, 0.5), (6.5, 84, 0.5), (7.0, 86, 0.75)]
    hook2 = [(0.0, 81, 0.5), (0.75, 79, 0.5), (1.5, 76, 1.0), (3.0, 74, 0.5), (3.5, 76, 0.5),
             (4.0, 79, 1.0), (5.0, 81, 0.5), (5.5, 79, 0.5), (6.0, 76, 0.5), (6.5, 74, 0.5), (7.0, 76, 0.75)]
    dense_hook = [(0.0, 86, 0.5), (0.75, 84, 0.25), (1.0, 81, 0.5), (1.75, 79, 0.25), (2.0, 81, 0.5),
                  (2.75, 84, 0.25), (3.0, 86, 0.75)]
    prev = None

    def play(phrase, t0, vel=1.0):
        nonlocal prev
        for b, m, d in phrase:
            lead_bus.add(lead(m, d * BEAT * 0.95, vel, glide_from=prev if prev and abs(prev - m) <= 5 else None),
                         t0 + b * BEAT, 0.42)
            prev = m

    play(hook, T(10))
    play(hook2, T(12))
    play(dense_hook, T(14))
    play(dense_hook, T(15))
    play([(0.0, 86, 0.5), (0.5, 88, 0.5), (1.0, 86, 0.5), (1.5, 84, 0.5), (2.0, 81, 1.0), (3.0, 79, 1.0)], T(16))
    play([(0.0, 79, 0.5), (0.5, 81, 0.5), (1.0, 84, 0.5), (1.5, 86, 0.5), (2.0, 88, 0.5), (2.5, 91, 0.5)], T(17))
    play([(0.0, 93, 2.5)], T(18), 0.9)
    play(hook2[:6], T(19), 0.85)
    # 片尾卡：电钢琴弹回 Lofi 的原旋律，原速的两倍音值，听着就是前段那首
    lofi_mel = [(20, 1.5, 69, 0.6), (20, 2.5, 67, 0.5), (21, 1.5, 64, 0.55), (22, 2.5, 62, 0.5),
                (22, 3.5, 64, 0.45), (23, 0.0, 67, 0.6)]
    for bar, b, m, v in lofi_mel:
        rhodes_chord(keys, [m + 12], T(bar, b), 0.9 * BEAT if bar < 23 else 2.5, v + 0.2, 0.9)

