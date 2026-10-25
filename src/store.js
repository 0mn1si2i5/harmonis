import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
export const id = () => randomUUID();
export function atomicJSON(file, data) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, file);
  fs.chmodSync(file, 0o600);
}
export function openStore(root) {
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  for (const dir of ['audio', 'uploads', 'tmp'])
    fs.mkdirSync(path.join(root, dir), { recursive: true, mode: 0o700 });
  const file = path.join(root, 'library.json');
  const data = fs.existsSync(file)
    ? JSON.parse(fs.readFileSync(file, 'utf8'))
    : { projects: [], voices: [], versions: [], jobs: [], uploads: [] };
  for (const job of data.jobs)
    if (['running', 'queued'].includes(job.status)) {
      job.status = 'interrupted';
      job.error = '本机服务已重启；上次请求的远端结果未知。请先核对供应商记录，再决定是否重新生成。';
    }
  const save = () => atomicJSON(file, data);
  save();
  // 导出包、格式转换的临时文件都放在 audio/ 和 tmp/；版本记录不引用的就是上次没清掉的，启动时删掉
  const kept = new Set(data.versions.map(v => v.file));
  for (const name of fs.readdirSync(path.join(root, 'audio')))
    if (!kept.has(name)) fs.rmSync(path.join(root, 'audio', name), { force: true, recursive: true });
  for (const name of fs.readdirSync(path.join(root, 'tmp')))
    fs.rmSync(path.join(root, 'tmp', name), { force: true, recursive: true });
  const keyFile = path.join(root, 'settings.json');
  let keys = fs.existsSync(keyFile) ? JSON.parse(fs.readFileSync(keyFile, 'utf8')) : {};
  return {
    root,
    data,
    save,
    file,
    keys: () => keys,
    saveKeys(update) {
      keys = { ...keys, ...update };
      atomicJSON(keyFile, keys);
    },
    audioFile(name) {
      if (!/^[a-f0-9-]+\.(wav|mp3|pcm|zip|srt)$/.test(name)) throw new Error('无效文件标识');
      return path.join(root, 'audio', name);
    },
  };
}
