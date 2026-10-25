import path from 'node:path';
import { id } from '../store.js';
import { UserError, required } from '../contracts.js';
export function registerVoicesRoutes(app, { store, db, dataDir, api, startJob, deletingVoices }) {
  app.post('/api/voices/import', async (req, res) => {
    const voiceId = required(req.body.voiceId, '音色 ID', 256).trim();
    const remote = await api.minimax('get_voice', { voice_type: 'voice_cloning' });
    const list = remote.voice_cloning || [];
    if (!list.some(v => v.voice_id === voiceId)) throw new UserError('该 ID 不在当前账户的克隆音色列表中');
    if (deletingVoices.has(voiceId)) throw new UserError('这个音色正在删除，请稍后再导入', 409);
    let v = db.voices.find(v => v.voiceId === voiceId);
    if (!v) {
      v = {
        id: id(),
        voiceId,
        name: (req.body.name || voiceId).slice(0, 80),
        createdAt: new Date().toISOString(),
        imported: true,
      };
      db.voices.unshift(v);
      store.save();
    }
    res.json(v);
  });
  app.delete('/api/voices/:id', async (req, res) => {
    const voice = db.voices.find(v => v.id === req.params.id);
    if (!voice) throw new UserError('找不到这个音色', 404);
    if (!['local', 'provider'].includes(req.body?.scope)) throw new UserError('请选择删除范围');
    if (
      deletingVoices.has(voice.voiceId) ||
      db.jobs.some(j => j.provider === 'minimax' && ['queued', 'running'].includes(j.status))
    )
      throw new UserError('MiniMax 还有操作在进行，等它结束后再删除音色', 409);
    deletingVoices.add(voice.voiceId);
    try {
      // 远端失败时保留本机音色，方便核对和重试；本机移除不调用供应商。
      if (req.body.scope === 'provider') {
        const result = await api.minimax('delete_voice', {
          voice_type: 'voice_cloning',
          voice_id: voice.voiceId,
        });
        if (result.voice_id !== voice.voiceId)
          throw new UserError('MiniMax 未确认删除这个音色，请核对官方控制台。本机记录仍保留。', 502);
      }
      db.voices = db.voices.filter(v => v.id !== voice.id);
      for (const p of db.projects) {
        let changed = false;
        if (p.draft?.voiceId === voice.voiceId) {
          p.draft.voiceId = '';
          changed = true;
        }
        for (const segment of p.draft?.segments || []) {
          if (segment.settings?.voiceId === voice.voiceId) {
            segment.settings.voiceId = '';
            changed = true;
          }
        }
        if (changed) p.updatedAt = new Date().toISOString();
      }
      store.save();
      res.json({ deleted: voice.id, scope: req.body.scope });
    } finally {
      deletingVoices.delete(voice.voiceId);
    }
  });
  app.post('/api/clone', (req, res) => {
    const input = structuredClone(req.body);
    const name = required(input.name, '音色名称', 80);
    const u = db.uploads.find(u => u.id === input.uploadId && !u.reference);
    if (!u) throw new UserError('请先录制或上传克隆音频');
    const ref = input.referenceId ? db.uploads.find(u => u.id === input.referenceId && u.reference) : null;
    if (input.referenceId && !ref) throw new UserError('参考录音不存在');
    if (ref) required(input.referenceText, '参考音频对应文字', 1000);
    const voiceId = 'sj_' + id().replaceAll('-', '');
    const job = startJob('clone', 'minimax', null, async job => {
      job.message = '正在上传克隆录音';
      store.save();
      const fileId = await api.upload(path.join(dataDir, 'uploads', u.file), 'voice_clone');
      const body = {
        file_id: fileId,
        voice_id: voiceId,
        need_noise_reduction: input.noiseReduction === true,
        need_volume_normalization: input.volumeNormalization === true,
      };
      if (ref) {
        job.message = '正在上传参考音频';
        store.save();
        body.clone_prompt = {
          prompt_audio: await api.upload(path.join(dataDir, 'uploads', ref.file), 'prompt_audio'),
          prompt_text: input.referenceText,
        };
      }
      job.message = 'MiniMax 正在克隆音色';
      store.save();
      await api.minimax('voice_clone', body);
      const voice = {
        id: id(),
        voiceId,
        name,
        uploadId: u.id,
        createdAt: new Date().toISOString(),
        firstUsedAt: null,
      };
      db.voices.unshift(voice);
      job.results.push(voice.id);
      store.save();
    });
    res.status(202).json(job);
  });
}
