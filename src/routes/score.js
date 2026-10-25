import fs from 'node:fs/promises';
import path from 'node:path';
import { UserError } from '../contracts.js';
import { scoreInput, render, findPython } from '../synth.js';

export function registerScoreRoutes(app, { store, projectById, startJob, saveVersion, tools }) {
  app.post('/api/score', async (req, res) => {
    const p = projectById(req.body.projectId);
    if (p.kind !== 'score') throw new UserError('项目类型不匹配');
    const input = scoreInput(req.body.input);
    // 启动时没找到的话再找一次，装好依赖后不用重启
    if (!tools.python) tools.python = (await findPython()) || false;
    if (!tools.python)
      throw new UserError(
        '没有找到装了 numpy 和 scipy 的 Python。装好后再试，或用环境变量 SHENGJIAN_PYTHON 指定解释器。'
      );
    const job = startJob('score', 'local', p.id, async job => {
      job.message = '正在本机合成';
      store.save();
      const dir = await fs.mkdtemp(path.join(store.root, 'tmp', 'score-'));
      try {
        const result = await render(tools.python, input, dir);
        const v = await saveVersion({
          projectId: p.id,
          kind: 'score',
          input,
          request: { score: input.score, loop: input.loop, bars: input.bars, seed: input.seed },
          bytes: await fs.readFile(result.file),
          providerId: 'synth',
          grid: result.grid,
        });
        job.results.push(v.id);
      } finally {
        await fs.rm(dir, { recursive: true, force: true });
      }
    });
    res.status(202).json(job);
  });
}
