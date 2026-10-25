import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { UserError, required, parsePronunciation } from './contracts.js';

// 克隆稿文件夹：一个 .txt 一段，文件名就是段名；下划线前相同的归成一组（一个项目）。
// 同一文件夹里的「读音词典.txt」按 MiniMax 读音规则格式读进项目，各段共用。
export const DICTIONARY_FILE = '读音词典.txt';
const MAX_FILES = 200;
const MAX_CHARS = 9999;

export function resolveFolder(dir) {
  const raw = required(dir, '文件夹路径', 1000).trim();
  const expanded =
    raw === '~' ? os.homedir() : raw.startsWith('~/') ? path.join(os.homedir(), raw.slice(2)) : raw;
  if (!path.isAbsolute(expanded)) throw new UserError('请填写完整路径，例如 ~/Projects/…/声音克隆稿');
  return path.resolve(expanded);
}

const hanCount = text => (text.match(/[一-鿿]/g) || []).length;

export async function readScriptFolder(dir) {
  const root = resolveFolder(dir);
  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    throw new UserError('读不到这个文件夹，请检查路径');
  }
  const names = entries
    .filter(
      e => e.isFile() && e.name.endsWith('.txt') && !e.name.startsWith('.') && e.name !== DICTIONARY_FILE
    )
    .map(e => e.name)
    .sort(new Intl.Collator('en', { numeric: true }).compare);
  if (!names.length) throw new UserError('文件夹里没有 .txt 稿件');
  if (names.length > MAX_FILES) throw new UserError(`稿件超过 ${MAX_FILES} 个`);
  const groups = new Map();
  for (const file of names) {
    const name = file.slice(0, -4);
    const text = (await fs.readFile(path.join(root, file), 'utf8')).trim();
    if (!text) continue;
    if (text.length > MAX_CHARS) throw new UserError(`${file} 超过 ${MAX_CHARS} 字符`);
    const cut = name.lastIndexOf('_');
    const group = cut > 0 ? name.slice(0, cut) : path.basename(root);
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push({ name, text, chars: hanCount(text) });
  }
  let dictionary = null;
  try {
    dictionary = parsePronunciation(await fs.readFile(path.join(root, DICTIONARY_FILE), 'utf8'));
  } catch (e) {
    if (e.code !== 'ENOENT')
      throw e instanceof UserError ? new UserError(`${DICTIONARY_FILE}：${e.message}`) : e;
  }
  return {
    dir: root,
    // 「声音克隆稿」这种通用文件夹名不适合当项目名，用上一级（例如「宣传片 第二期」）
    title: path.basename(path.dirname(root)),
    groups: [...groups].map(([name, segments]) => ({ name, segments })),
    dictionary,
  };
}
