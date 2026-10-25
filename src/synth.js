import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { UserError } from './contracts.js';

const exec = promisify(execFile);
// 本机合成：synth/ 下的 Python 引擎，依赖 numpy 和 scipy
export const SYNTH_DIR =
  process.env.HARMONIS_SYNTH_DIR || fileURLToPath(new URL('../synth/', import.meta.url));
const SCORES = path.join(SYNTH_DIR, 'scores');

// 启动器的 PATH 里排第一的 python3 不一定装了 numpy，按顺序试，用第一个能用的
export async function findPython() {
  const candidates = [
    process.env.HARMONIS_PYTHON,
    process.env.SHENGJIAN_PYTHON,
    'python3',
    '/opt/anaconda3/bin/python3',
    '/opt/homebrew/bin/python3',
    '/usr/local/bin/python3',
    '/usr/bin/python3',
  ].filter(Boolean);
  for (const bin of new Set(candidates)) {
    try {
      await exec(bin, ['-c', 'import numpy, scipy'], { timeout: 30000 });
      return bin;
    } catch {}
  }
  return null;
}

// 曲谱列表：synth/scores 下的 .py，标题取模块文档字符串第一行
export async function listScores() {
  const files = (await fs.readdir(SCORES)).filter(f => f.endsWith('.py')).sort();
  return Promise.all(
    files.map(async file => {
      const text = await fs.readFile(path.join(SCORES, file), 'utf8');
      const song = text.match(/^SONG\s*=\s*dict\(([^)]*)\)/m)?.[1] || '';
      const num = key => Number(song.match(new RegExp(`\\b${key}\\s*=\\s*(\\d+)`))?.[1]) || null;
      return {
        file,
        title: text.match(/^"""([^\n]*?)(?:"""|\n)/)?.[1].trim() || file,
        bpm: num('bpm'),
        bars: num('bars'),
      };
    })
  );
}

export function scoreInput(raw = {}) {
  if (typeof raw.score !== 'string' || !/^[\w.-]+\.py$/.test(raw.score)) throw new UserError('请选择曲谱');
  const plucks = typeof raw.plucks === 'string' ? raw.plucks : '';
  if (plucks.length > 20000) throw new UserError('拨弦数据超过 20000 字符');
  const int = (v, name, min, max) => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    if (!Number.isInteger(n) || n < min || n > max) throw new UserError(`${name}须为 ${min}–${max} 的整数`);
    return n;
  };
  return {
    score: raw.score,
    plucks,
    loop: raw.loop === true,
    bars: int(raw.bars, '小节数', 1, 128),
    seed: int(raw.seed, '随机种子', 0, 2 ** 31 - 1),
  };
}

/** 渲染一首曲谱到 workDir，返回 WAV 路径和拍号信息（速度、每小节拍数、弱起、小节数）。 */
export async function render(python, input, workDir) {
  const score = path.join(SCORES, input.score);
  try {
    await fs.access(score);
  } catch {
    throw new UserError('找不到这个曲谱');
  }
  const out = path.join(workDir, 'score.wav'),
    peaks = path.join(workDir, 'score.peaks.json');
  const args = ['-m', 'engine.render', 'scores/' + input.score, '--out', out, '--peaks', peaks];
  if (input.plucks.trim()) {
    const file = path.join(workDir, 'plucks.txt');
    await fs.writeFile(file, input.plucks);
    args.push('--plucks', file);
  }
  args.push(input.loop ? '--loop' : '--no-loop');
  if (input.bars) args.push('--bars', String(input.bars));
  if (input.seed !== null) args.push('--seed', String(input.seed));
  try {
    await exec(python, args, { cwd: SYNTH_DIR, timeout: 300000, maxBuffer: 4 * 1024 * 1024 });
  } catch (e) {
    throw new UserError(String(e.stderr || '').trim() || '合成失败');
  }
  const { peaks: _, ...grid } = JSON.parse(await fs.readFile(peaks, 'utf8'));
  return { file: out, grid };
}
