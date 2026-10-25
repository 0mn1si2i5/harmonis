import { UserError } from '../contracts.js';
export function registerSettingsRoutes(app, { store, db, api, deletingVoices }) {
  app.put('/api/settings', (req, res) => {
    const update = {};
    for (const key of ['minimax', 'elevenlabs'])
      if (typeof req.body[key] === 'string' && req.body[key].trim()) {
        if (req.body[key].length > 4096) throw new UserError('密钥长度异常');
        update[key] = req.body[key].trim();
      }
    store.saveKeys(update);
    res.json({ saved: true, minimax: !!store.keys().minimax, elevenlabs: !!store.keys().elevenlabs });
  });
  app.delete('/api/settings/:provider', (req, res) => {
    const provider = req.params.provider;
    if (!['minimax', 'elevenlabs'].includes(provider)) throw new UserError('无效服务');
    if (
      (provider === 'minimax' && deletingVoices.size) ||
      db.jobs.some(j => j.provider === provider && ['queued', 'running'].includes(j.status))
    )
      throw new UserError('该服务还有操作在进行，等它结束后再移除密钥', 409);
    store.saveKeys({ [provider]: '' });
    res.json({ removed: provider });
  });
  app.post('/api/settings/test/:provider', async (req, res) => {
    if (!['minimax', 'elevenlabs'].includes(req.params.provider)) throw new UserError('无效服务');
    res.json({ message: await api.test(req.params.provider) });
  });
}
