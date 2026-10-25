import fsp from 'node:fs/promises';
import { id } from '../store.js';
import { UserError } from '../contracts.js';
export function registerProjectsRoutes(app, { store, db, projectById }) {
  app.post('/api/projects', (req, res) => {
    const kind = ['music', 'score'].includes(req.body.kind) ? req.body.kind : 'speech';
    const p = {
      id: id(),
      kind,
      title: (req.body.title || '未命名' + { speech: '配音', music: '音乐', score: '编曲' }[kind]).slice(
        0,
        100
      ),
      draft: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.projects.unshift(p);
    store.save();
    res.status(201).json(p);
  });
  app.put('/api/projects/:id', (req, res) => {
    const p = projectById(req.params.id);
    if (typeof req.body.title === 'string') p.title = req.body.title.slice(0, 100);
    if (req.body.draft && typeof req.body.draft === 'object' && !Array.isArray(req.body.draft))
      p.draft = req.body.draft;
    p.updatedAt = new Date().toISOString();
    store.save();
    res.json(p);
  });
  // 删除项目连同它的全部版本和音频文件；正在生成的项目不能删
  app.delete('/api/projects/:id', async (req, res) => {
    const p = projectById(req.params.id);
    if (db.jobs.some(j => j.projectId === p.id && ['queued', 'running'].includes(j.status)))
      throw new UserError('这个项目还有任务在进行，等它结束再删除', 409);
    const versions = db.versions.filter(v => v.projectId === p.id);
    db.projects.splice(db.projects.indexOf(p), 1);
    db.versions = db.versions.filter(v => v.projectId !== p.id);
    store.save();
    await Promise.all(versions.map(v => fsp.rm(store.audioFile(v.file), { force: true })));
    res.json({ deleted: p.id, versions: versions.length });
  });
}
