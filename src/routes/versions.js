import path from 'node:path';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import archiver from 'archiver';
import { id } from '../store.js';
import { UserError } from '../contracts.js';
import * as audio from '../audio.js';
import { processVoice, shiftCues, toSRT, peaks } from '../postprocess.js';

const safeName = name =>
  String(name)
    .replace(/[\\/:*?"<>|\n\r]/g, '_')
    .trim()
    .slice(0, 120) || '音频';

export function registerVersionsRoutes(app, { store, db, versionById, projectById }) {
  // 下载文件名：分段版本用段名（例如 B站_01），否则用「项目名_整篇/段N」
  const baseName = v => {
    if (v.input?.segmentName) return safeName(v.input.segmentName);
    const title = db.projects.find(p => p.id === v.projectId)?.title || 'Harmonis';
    return safeName(`${title}_${v.sectionIndex === null ? '整篇' : '段' + (Number(v.sectionIndex) + 1)}`);
  };
  app.get('/api/versions/:id/audio', async (req, res) => {
    const v = versionById(req.params.id);
    const requested = req.query.format;
    if (requested && !['wav', 'mp3'].includes(requested)) throw new UserError('请选择 WAV 或 MP3');
    let file = store.audioFile(v.file),
      ext = path.extname(v.file).slice(1);
    if (requested && requested !== ext) {
      const dest = store.audioFile(id() + '.' + requested);
      await audio.transcode(file, dest, requested);
      file = dest;
      ext = requested;
      res.on('finish', () => fsp.rm(dest, { force: true }).catch(() => {}));
    }
    if (req.query.download === '1') return res.download(file, `${baseName(v)}_${v.id.slice(0, 6)}.${ext}`);
    res.sendFile(file);
  });
  const peakCache = new Map();
  app.get('/api/versions/:id/peaks', async (req, res) => {
    const v = versionById(req.params.id);
    if (!peakCache.has(v.id)) peakCache.set(v.id, await peaks(store.audioFile(v.file)));
    res.json({ duration: v.duration, peaks: peakCache.get(v.id) });
  });
  app.delete('/api/versions/:id', async (req, res) => {
    const v = versionById(req.params.id);
    db.versions.splice(db.versions.indexOf(v), 1);
    store.save();
    await fsp.rm(store.audioFile(v.file), { force: true });
    res.json({ deleted: v.id });
  });
  /**
   * 导出。mode=zip 每个版本一个文件；mode=merge 按顺序拼成一条。
   * process 打开时逐个做成品处理（去首尾静音、响度统一、48 kHz），srt 打开时附带字幕。
   */
  app.post('/api/export', async (req, res) => {
    const ids = req.body.versionIds;
    if (!Array.isArray(ids) || !ids.length || ids.length > 100) throw new UserError('请选择需要导出的版本');
    const versions = ids.map(versionById);
    const format = req.body.format === 'mp3' ? 'mp3' : 'wav';
    const options = req.body.process || {};
    const processing = !!(options.trim || options.loudness || options.sampleRate48);
    const sampleRate = options.sampleRate48 ? 48000 : 44100;
    const srt = req.body.srt === true;
    const title = safeName(req.body.title || 'Harmonis导出');
    // 同名的（例如同一段的两版）后面加序号
    const used = new Map();
    const names = versions.map((v, i) => {
      const base = safeName(req.body.names?.[i] || baseName(v));
      const n = (used.get(base) || 0) + 1;
      used.set(base, n);
      return n > 1 ? `${base}_${n}` : base;
    });
    const exportId = id(),
      temp = [];
    const tempFile = ext => {
      const f = store.audioFile(id() + '.' + ext);
      temp.push(f);
      return f;
    };
    const prepare = async (v, ext) => {
      const source = store.audioFile(v.file);
      if (!processing) {
        if (path.extname(source).slice(1) === ext)
          return { file: source, offset: 0, duration: (await audio.probe(source)).duration };
        const dest = tempFile(ext);
        await audio.transcode(source, dest, ext);
        return { file: dest, offset: 0, duration: (await audio.probe(dest)).duration };
      }
      const dest = tempFile(ext);
      const r = await processVoice(source, dest, {
        trim: !!options.trim,
        loudness: !!options.loudness,
        sampleRate,
        format: ext,
      });
      return { file: dest, ...r };
    };
    try {
      if (req.body.mode === 'zip') {
        const dest = store.audioFile(exportId + '.zip');
        const entries = [];
        for (const [i, v] of versions.entries()) {
          const p = await prepare(v, format);
          entries.push({ file: p.file, name: `${names[i]}.${format}` });
          if (srt && v.subtitles)
            entries.push({
              text: toSRT(shiftCues(v.subtitles, -p.offset, p.duration)),
              name: `${names[i]}.srt`,
            });
        }
        await new Promise((resolve, reject) => {
          const out = fs.createWriteStream(dest, { mode: 0o600 });
          const archive = archiver('zip', { zlib: { level: 1 } });
          out.on('close', resolve);
          out.on('error', reject);
          archive.on('error', reject);
          archive.pipe(out);
          for (const e of entries)
            e.text !== undefined
              ? archive.append(e.text, { name: e.name })
              : archive.file(e.file, { name: e.name });
          archive.finalize();
        });
        res.json({ url: `/api/exports/${exportId}.zip?name=${encodeURIComponent(title)}` });
      } else {
        const parts = [],
          cues = [];
        let at = 0;
        for (const v of versions) {
          const p = await prepare(v, 'wav');
          const wav = tempFile('wav');
          await audio.transcode(p.file, wav, 'wav', 2);
          parts.push(wav);
          if (srt && v.subtitles) cues.push(...shiftCues(v.subtitles, at - p.offset, at + p.duration));
          at += (await audio.probe(wav)).duration;
        }
        const merged = store.audioFile(exportId + '.wav');
        await audio.merge(parts, merged, sampleRate);
        if (format === 'mp3') {
          await audio.transcode(merged, store.audioFile(exportId + '.mp3'), 'mp3');
          await fsp.rm(merged);
        }
        const result = { url: `/api/exports/${exportId}.${format}?name=${encodeURIComponent(title)}` };
        if (srt && cues.length) {
          await fsp.writeFile(store.audioFile(exportId + '.srt'), toSRT(cues), { mode: 0o600 });
          result.srt = `/api/exports/${exportId}.srt?name=${encodeURIComponent(title)}`;
        }
        res.json(result);
      }
    } finally {
      await Promise.all(temp.map(f => fsp.rm(f, { force: true })));
    }
  });
  // 导出文件下载一次就删；没下载的在下次启动时清掉
  app.get('/api/exports/:file', (req, res) => {
    const f = store.audioFile(req.params.file);
    if (!fs.existsSync(f)) throw new UserError('导出文件已经下载过或已过期，请重新导出', 404);
    const name = safeName(req.query.name || 'Harmonis导出') + path.extname(f);
    res.download(f, name, () => fsp.rm(f, { force: true }).catch(() => {}));
  });
}
