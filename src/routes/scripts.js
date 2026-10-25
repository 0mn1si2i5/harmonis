import { id } from '../store.js';
import { UserError } from '../contracts.js';
import { readScriptFolder } from '../scripts.js';

const segment = s => ({ id: id(), name: s.name, text: s.text, settings: {} });

export function registerScriptsRoutes(app, { store, db, projectById }) {
  app.post('/api/scripts/preview', async (req, res) => {
    const folder = await readScriptFolder(req.body.dir);
    res.json({
      dir: folder.dir,
      title: folder.title,
      dictionary: folder.dictionary ? folder.dictionary.length : 0,
      groups: folder.groups.map(g => ({
        name: g.name,
        segments: g.segments.length,
        chars: g.segments.reduce((n, s) => n + s.chars, 0),
      })),
    });
  });
  // 每组建一个分段项目，记下来源，之后可以「重新读取稿件」
  app.post('/api/scripts/import', async (req, res) => {
    const folder = await readScriptFolder(req.body.dir);
    const wanted = Array.isArray(req.body.groups) ? req.body.groups : folder.groups.map(g => g.name);
    const groups = folder.groups.filter(g => wanted.includes(g.name));
    if (!groups.length) throw new UserError('请至少选一组稿件');
    const now = new Date().toISOString();
    const created = groups.map(g => ({
      id: id(),
      kind: 'speech',
      title: `${folder.title} ${g.name}`.slice(0, 100),
      draft: {
        mode: 'split',
        segments: g.segments.map(segment),
        ...(req.body.dictionary !== false && folder.dictionary
          ? { pronunciation: folder.dictionary.join('\n') }
          : {}),
        source: { dir: folder.dir, group: g.name },
      },
      createdAt: now,
      updatedAt: now,
    }));
    db.projects.unshift(...created);
    store.save();
    res.status(201).json({ projects: created });
  });
  // 按段名对上：文字变了就更新，新文件追加到末尾，文件夹里没有了的段保留不动
  app.post('/api/scripts/reload', async (req, res) => {
    const p = projectById(req.body.projectId);
    const source = p.draft?.source;
    if (!source?.dir) throw new UserError('这个项目不是从稿件文件夹导入的');
    const folder = await readScriptFolder(source.dir);
    const group = folder.groups.find(g => g.name === source.group);
    if (!group) throw new UserError(`文件夹里已经没有「${source.group}」开头的稿件`);
    const segments = structuredClone(p.draft.segments || []);
    const changed = [],
      added = [];
    for (const s of group.segments) {
      const old = segments.find(x => x.name === s.name);
      if (!old) {
        segments.push(segment(s));
        added.push(s.name);
      } else if (old.text !== s.text) {
        old.text = s.text;
        changed.push(s.name);
      }
    }
    p.draft = { ...p.draft, segments };
    if (folder.dictionary && req.body.dictionary !== false)
      p.draft.pronunciation = folder.dictionary.join('\n');
    p.updatedAt = new Date().toISOString();
    store.save();
    res.json({ project: p, changed, added });
  });
}
