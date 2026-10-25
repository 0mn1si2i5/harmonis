"""剪辑步数据解析与牌数音高映射。"""
import csv
import json
import math
from .harmony import pentatonic_step

def parse(text):
    stripped = text.lstrip()
    if stripped.startswith(('[', '{')):
        try:
            data = json.loads(text)
        except ValueError as e:
            raise ValueError('拨弦 JSON 格式错误') from e
        if isinstance(data, dict):
            segments = data.get('segments', [data])
        elif isinstance(data, list):
            segments = data if not data or 'steps' in data[0] else [{'steps': data}]
        else:
            raise ValueError('拨弦 JSON 须为段或步列表')
    else:
        steps = []
        first = True
        for line_no, line in enumerate(text.splitlines(), 1):
            if not line.strip() or line.lstrip().startswith('#'):
                continue
            row = next(csv.reader([line]))
            if first and [v.strip().lower() for v in row] in (['bar','beat','cards'], ['小节','拍','牌数']):
                first = False
                continue
            first = False
            try:
                if len(row) != 3:
                    raise ValueError()
                bar, beat, cards = map(float, row)
                steps.append(dict(bar=bar, beat=beat, cards=cards))
            except ValueError as e:
                raise ValueError(f'拨弦 CSV 第 {line_no} 行须为小节,拍,牌数') from e
        segments = [{'steps': steps}]
    try:
        for segment in segments:
            steps = segment['steps']
            segment.setdefault('base_cards', steps[0]['cards'] if steps else 0)
            for s in steps:
                bar, beat, cards = (float(s[k]) for k in ('bar','beat','cards'))
                if not all(map(math.isfinite, (bar, beat, cards))) or bar < 1 or bar != int(bar) or beat < 0 or cards != int(cards):
                    raise ValueError()
            for k, default in [('base_note',62), ('fold_above',96), ('gain',1), ('base_cards',0)]:
                v = float(segment.get(k,default))
                if not math.isfinite(v) or (k != 'gain' and v != int(v)):
                    raise ValueError()
    except (TypeError, KeyError, ValueError, AttributeError) as e:
        raise ValueError('拨弦段或步字段无效') from e
    return segments

def notes(song, segments):
    result = []
    for seg in segments:
        for step in seg['steps']:
            m = pentatonic_step(int(seg.get('base_note',62)), int(step['cards'])-int(seg['base_cards']))
            while m > seg.get('fold_above',96):
                m -= 12
            result.append((song.T(float(step['bar']),float(step['beat'])), m, float(seg.get('gain',1))))
    return sorted(result, key=lambda x:x[0])
