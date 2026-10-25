"""和弦配置及音阶走级。"""
CH = {
    'Dm9': (38, [53, 57, 60, 64]),
    'G13': (43, [53, 57, 59, 64]),
    'Cmaj9': (36, [52, 55, 59, 62]),
    'Am9': (33, [55, 59, 60, 64]),
    'Fmaj9': (41, [57, 60, 64, 67]),
    'Em9': (40, [55, 59, 62, 66]),
    'Bbmaj9': (34, [57, 60, 62, 65]),
    'C69': (36, [55, 60, 62, 64]),
}
LOFI_LOOP = ['Dm9', 'G13', 'Cmaj9', 'Am9', 'Fmaj9', 'Em9', 'Dm9', 'G13']

MOTIF = [69, 67, 64, 62, 64, 67]

class Plan(dict):
    def chord_at(self, bar, beat=0):
        cur = self[bar][0][1]
        for b, chord in sorted(self[bar]):
            if beat >= b - 1e-9:
                cur = chord
        return cur

def pentatonic_step(base, steps):
    scale = [0, 2, 4, 7, 9]
    octave, pitch = divmod(base, 12)
    if pitch not in scale:
        raise ValueError('起音必须属于 C 大调五声音阶')
    octave, index = divmod(octave * 5 + scale.index(pitch) + steps, 5)
    return octave * 12 + scale[index]
