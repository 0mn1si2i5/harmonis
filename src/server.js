import { createJobs } from './jobs.js';
import { registerSettingsRoutes } from './routes/settings.js';
import { registerProjectsRoutes } from './routes/projects.js';
import { registerUploadsRoutes, normalizeUploadName } from './routes/uploads.js';
import { registerVoicesRoutes } from './routes/voices.js';
import { registerSpeechRoutes } from './routes/speech.js';
import { registerMusicRoutes } from './routes/music.js';
import { registerVersionsRoutes } from './routes/versions.js';
import { registerScriptsRoutes } from './routes/scripts.js';
import { registerJobsRoutes } from './routes/jobs.js';
import { registerScoreRoutes } from './routes/score.js';
import { findPython, listScores } from './synth.js';
import express from 'express';
import multer from 'multer';
import { dataDirectory } from './paths.js';
import { acquireLibraryLock } from '../desktop/runtime.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStore } from './store.js';
import { createProviders, safeError, minimaxKeyType } from './providers.js';
import { UserError, speechModels, basicEmotions } from './contracts.js';
import * as audio from './audio.js';
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export function createApp({ dataDir = dataDirectory(), sessionToken, transport = fetch } = {}) {
  const app = express();
  const store = openStore(dataDir),
    db = store.data;
  const api = createProviders(() => store.keys(), transport);
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    const host = req.hostname;
    if (!['127.0.0.1', 'localhost', '::1'].includes(host))
      return res.status(403).json({ error: '仅允许本机访问' });
    if (
      sessionToken &&
      !String(req.headers.cookie || '')
        .split(';')
        .some(part => part.trim() === 'harmonis-session=' + sessionToken)
    )
      return res.status(403).json({ error: '请在 Harmonis App 中打开。' });
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    if (req.path.startsWith('/api') && req.method !== 'GET' && req.method !== 'HEAD') {
      if (req.get('X-Harmonis') !== '1' && req.get('X-Shengjian') !== '1')
        return res.status(403).json({ error: '请从Harmonis页面发起操作' });
      if (req.get('Origin') && req.get('Origin') !== `${req.protocol}://${req.get('host')}`)
        return res.status(403).json({ error: '跨站请求被拒绝' });
    }
    next();
  });
  app.use(express.json({ limit: '1mb' }));
  const upload = multer({
    dest: path.join(dataDir, 'tmp'),
    limits: { fileSize: 40 * 1024 * 1024, files: 1 },
  });
  const projectById = value => {
    const p = db.projects.find(x => x.id === value);
    if (!p) throw new UserError('找不到这个项目', 404);
    return p;
  };
  const deletingVoices = new Set();
  const voiceById = value => {
    if (deletingVoices.has(value)) throw new UserError('这个音色正在删除，请稍后再试', 409);
    const v = db.voices.find(v => v.voiceId === value);
    if (!v) throw new UserError('请先建立或导入你的音色');
    return v;
  };
  const versionById = value => {
    const v = db.versions.find(v => v.id === value);
    if (!v) throw new UserError('找不到这版音频', 404);
    return v;
  };
  const { startJob, saveVersion } = createJobs(store);
  // 启动时查一次本机工具，页面顶栏显示
  const tools = { ffmpeg: null, python: null };
  audio.dependencies().then(ok => (tools.ffmpeg = ok));
  findPython().then(bin => (tools.python = bin || false));
  app.get('/api/health', async (req, res) =>
    res.json({ app: 'harmonis', version: '0.1.0', audioTools: await audio.dependencies() })
  );
  app.get('/api/state', async (req, res) =>
    res.json({
      ...db,
      uploads: db.uploads.map(({ file, ...rest }) => ({
        ...rest,
        name: normalizeUploadName(rest.name || '录音'),
      })),
      versions: db.versions.map(({ file, ...rest }) => rest),
      settings: {
        minimax: !!store.keys().minimax,
        elevenlabs: !!store.keys().elevenlabs,
        minimaxKeyType: minimaxKeyType(store.keys().minimax),
      },
      dataDir,
      capabilities: { speechModels, basicEmotions },
      tools,
      scores: await listScores(),
    })
  );
  const context = {
    store,
    db,
    dataDir,
    api,
    upload,
    projectById,
    voiceById,
    deletingVoices,
    versionById,
    startJob,
    saveVersion,
    tools,
  };
  registerSettingsRoutes(app, context);
  registerProjectsRoutes(app, context);
  registerUploadsRoutes(app, context);
  registerVoicesRoutes(app, context);
  registerSpeechRoutes(app, context);
  registerMusicRoutes(app, context);
  registerVersionsRoutes(app, context);
  registerScriptsRoutes(app, context);
  registerScoreRoutes(app, context);
  registerJobsRoutes(app, context);
  app.use('/api', (req, res) => res.status(404).json({ error: '接口不存在' }));
  app.use(express.static(path.join(root, 'public')));
  app.use((e, req, res, next) => {
    if (res.headersSent) return next(e);
    res
      .status(e.status || 400)
      .json({ error: e.code === 'LIMIT_FILE_SIZE' ? '上传文件超过 40 MB' : safeError(e, store.keys()) });
  });
  return { app, store };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dataDir = dataDirectory();
  const releaseLock = await acquireLibraryLock(dataDir);
  const { app } = createApp({ dataDir });
  const port = Number(process.env.PORT || 4317);
  const server = app.listen(port, '127.0.0.1', () => console.log(`Harmonis已启动：http://127.0.0.1:${port}`));
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.once(signal, () => {
      server.closeAllConnections();
      server.close(async () => {
        await releaseLock();
        process.exit(0);
      });
    });
  server.on('error', async e => {
    await releaseLock();
    console.error(
      e.code === 'EADDRINUSE' ? '端口被占用，请打开已运行的Harmonis或设置 PORT 后重试' : e.message
    );
    process.exit(1);
  });
}
