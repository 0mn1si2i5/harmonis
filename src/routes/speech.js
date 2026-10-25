import { buildSpeech, UserError } from '../contracts.js';
export function registerSpeechRoutes(app, { store, api, projectById, voiceById, startJob, saveVersion }) {
  app.post('/api/speech/preview', (req, res) => res.json({ request: buildSpeech(req.body) }));
  app.post('/api/speech', (req, res) => {
    const p = projectById(req.body.projectId);
    if (p.kind !== 'speech') throw new UserError('项目类型不匹配');
    const input = structuredClone(req.body.input);
    const sections = req.body.sections || [{ text: input.text, index: null }];
    if (!Array.isArray(sections) || sections.length === 0 || sections.length > 100)
      throw new UserError('请选择有效段落');
    const work = sections.map(s => {
      // 读音词典整个项目共用，段落里的同名设置不生效
      const { pronunciation, ...settings } = s.settings || {};
      const effective = {
        ...input,
        ...settings,
        text: s.text,
        segmentId: s.segmentId,
        ...(typeof s.name === 'string' && s.name.trim() ? { segmentName: s.name.trim().slice(0, 80) } : {}),
      };
      delete effective.segments;
      delete effective.source;
      delete effective.chosen;
      return {
        input: effective,
        index: s.index ?? null,
        request: buildSpeech(effective),
        voice: voiceById(effective.voiceId),
      };
    });
    const job = startJob('speech', 'minimax', p.id, async job => {
      for (let i = 0; i < work.length; i++) {
        const w = work[i];
        job.message = `正在生成 ${i + 1}/${work.length}`;
        store.save();
        const result = await api.speech(w.request);
        const v = await saveVersion({
          projectId: p.id,
          kind: 'speech',
          input: w.input,
          request: w.request,
          bytes: result.bytes,
          sectionIndex: w.index,
          usage: result.usage,
          providerId: result.traceId,
          subtitles: result.subtitles,
        });
        w.voice.firstUsedAt = w.voice.firstUsedAt || new Date().toISOString();
        job.results.push(v.id);
        store.save();
      }
    });
    res.status(202).json(job);
  });
}
