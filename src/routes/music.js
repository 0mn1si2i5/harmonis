import { buildMusic, UserError } from '../contracts.js';
export function registerMusicRoutes(app, { api, projectById, startJob, saveVersion, store }) {
  app.post('/api/music/preview', (req, res) => res.json(buildMusic(req.body)));
  app.post('/api/music', (req, res) => {
    const p = projectById(req.body.projectId);
    if (p.kind !== 'music') throw new UserError('项目类型不匹配');
    const input = structuredClone(req.body.input),
      request = buildMusic(input);
    const job = startJob('music', 'elevenlabs', p.id, async job => {
      job.message = 'ElevenLabs 正在创作音乐，请稍候';
      store.save();
      const result = await api.music(request);
      const v = await saveVersion({
        projectId: p.id,
        kind: 'music',
        input,
        request: request.body,
        bytes: result.bytes,
        format: request.format,
        providerId: result.songId || result.requestId,
        usage: { estimatedUSD: request.estimatedUSD },
      });
      job.results.push(v.id);
    });
    res.status(202).json(job);
  });
}
