import fsp from 'node:fs/promises';
import { id } from './store.js';
import { publicJSON, safeError } from './providers.js';
import { UserError } from './contracts.js';
import * as audio from './audio.js';
export function createJobs(store) {
  const db = store.data;
  function startJob(type, provider, projectId, work) {
    if (db.jobs.some(j => j.provider === provider && ['queued', 'running'].includes(j.status)))
      throw new UserError('该服务还有任务在进行，请等待完成后再生成', 409);
    if (provider !== 'local' && !store.keys()[provider])
      throw new UserError(`请先填写 ${provider === 'minimax' ? 'MiniMax' : 'ElevenLabs'} API Key`);
    const job = {
      id: id(),
      type,
      provider,
      projectId,
      status: 'queued',
      createdAt: new Date().toISOString(),
      results: [],
      message: '等待开始',
    };
    db.jobs.unshift(job);
    store.save();
    setImmediate(async () => {
      job.status = 'running';
      job.message = '正在处理';
      store.save();
      try {
        await work(job);
        job.status = 'done';
        job.message = '完成';
      } catch (e) {
        job.status = 'failed';
        job.error = safeError(e, store.keys());
        job.message = job.results.length ? '部分完成，已保留成功结果' : '未完成';
      }
      job.updatedAt = new Date().toISOString();
      store.save();
    });
    return job;
  }
  async function saveVersion({
    projectId,
    kind,
    input,
    request,
    bytes,
    format = 'wav',
    sectionIndex = null,
    usage = {},
    providerId,
    subtitles = null,
    grid = null,
  }) {
    const versionId = id();
    let fileName =
      versionId + '.' + (format.startsWith('pcm') ? 'pcm' : format.startsWith('mp3') ? 'mp3' : 'wav');
    let file = store.audioFile(fileName);
    await fsp.writeFile(file, bytes, { mode: 0o600 });
    try {
      if (format.startsWith('pcm')) {
        const dest = store.audioFile(versionId + '.wav');
        await audio.wrapPCM(file, dest);
        await fsp.rm(file);
        fileName = versionId + '.wav';
        file = dest;
      }
      const info = await audio.probe(file);
      const v = {
        id: versionId,
        projectId,
        kind,
        input: structuredClone(input),
        request: publicJSON(request),
        file: fileName,
        duration: info.duration,
        bytes: info.bytes,
        sectionIndex,
        usage,
        providerId,
        ...(subtitles ? { subtitles } : {}),
        ...(grid ? { grid } : {}),
        createdAt: new Date().toISOString(),
      };
      db.versions.unshift(v);
      store.save();
      return v;
    } catch (e) {
      await fsp.rm(file, { force: true });
      throw e;
    }
  }
  return { startJob, saveVersion };
}
