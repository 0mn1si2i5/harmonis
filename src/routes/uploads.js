import fs from 'node:fs';
import path from 'node:path';
import fsp from 'node:fs/promises';
import { id } from '../store.js';
import { UserError } from '../contracts.js';
import * as audio from '../audio.js';
import { analyze } from '../postprocess.js';
// multipart 文件名可能被按 latin1 解码；只修复能够无损还原的 UTF-8 名称。
export function normalizeUploadName(name) {
  if (/[^\u0000-\u00ff]/u.test(name)) return name;
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  return decoded.includes('\ufffd') ? name : decoded;
}
export function registerUploadsRoutes(app, { store, db, dataDir, upload }) {
  app.post('/api/uploads', upload.single('audio'), async (req, res) => {
    if (!req.file) throw new UserError('请选择音频');
    const reference = req.body.reference === 'true';
    const uploadId = id(),
      dest = path.join(dataDir, 'uploads', uploadId + '.wav');
    try {
      const info = await audio.normalize(req.file.path, dest, reference);
      const u = {
        id: uploadId,
        file: uploadId + '.wav',
        name: normalizeUploadName(req.file.originalname || '录音').slice(0, 180),
        reference,
        duration: info.duration,
        bytes: info.bytes,
        // 峰值、电平、底噪、响度，给录音弹窗的检查用；算不出来不影响上传
        analysis: await analyze(dest).catch(() => null),
        createdAt: new Date().toISOString(),
      };
      db.uploads.unshift(u);
      store.save();
      res.status(201).json({ ...u, file: undefined });
    } catch (e) {
      await fsp.rm(dest, { force: true });
      throw e;
    } finally {
      await fsp.rm(req.file.path, { force: true });
    }
  });
  app.delete('/api/uploads/:id', (req, res) => {
    const u = db.uploads.find(u => u.id === req.params.id);
    if (!u) throw new UserError('找不到录音', 404);
    if (db.jobs.some(j => j.type === 'clone' && ['queued', 'running'].includes(j.status)))
      throw new UserError('音色克隆正在使用录音，请等任务结束后再删除', 409);
    fs.rmSync(path.join(dataDir, 'uploads', u.file), { force: true });
    db.uploads = db.uploads.filter(item => item.id !== u.id);
    for (const voice of db.voices) if (voice.uploadId === u.id) delete voice.uploadId;
    store.save();
    res.json({ deleted: u.id });
  });
  app.get('/api/uploads/:id/audio', (req, res) => {
    const u = db.uploads.find(u => u.id === req.params.id);
    if (!u) throw new UserError('找不到录音', 404);
    res.sendFile(path.join(dataDir, 'uploads', u.file));
  });
}
