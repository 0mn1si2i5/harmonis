import fs from 'node:fs/promises';
import path from 'node:path';

export async function migrateLegacyLibrary(legacy, destination) {
  try {
    await fs.access(path.join(destination, 'library.json'));
    return false;
  } catch {}
  try {
    await fs.access(path.join(legacy, 'library.json'));
  } catch {
    return false;
  }
  const existing = await fs.readdir(destination).catch(() => []);
  if (existing.length) throw new Error('新版资料目录已有文件但缺少资料库，未覆盖。请先检查数据目录。');
  const staging = destination + '.importing';
  await fs.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
  await fs.rm(staging, { recursive: true, force: true });
  await fs.cp(legacy, staging, {
    recursive: true,
    filter: source => !['tmp', '.lock'].includes(path.basename(source)),
  });
  await fs.chmod(staging, 0o700);
  for (const name of ['library.json', 'settings.json']) {
    await fs.chmod(path.join(staging, name), 0o600).catch(() => {});
  }
  // Existing library files are never overwritten. Legacy data stays intact.
  await fs.rmdir(destination).catch(e => {
    if (e.code !== 'ENOENT') throw e;
  });
  await fs.rename(staging, destination);
  return true;
}

export async function acquireLibraryLock(directory) {
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const file = path.join(directory, '.lock');
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const handle = await fs.open(file, 'wx', 0o600);
      await handle.writeFile(String(process.pid));
      await handle.close();
      return async () => {
        await fs.rm(file, { force: true });
      };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const pid = Number(await fs.readFile(file, 'utf8').catch(() => ''));
      if (Number.isInteger(pid) && pid > 0) {
        try {
          process.kill(pid, 0);
          throw new Error('这份资料库正在使用中。请先退出另一个 Harmonis 或网页服务。');
        } catch (e) {
          if (e.code !== 'ESRCH') throw e;
        }
      }
      await fs.rm(file, { force: true });
    }
  }
  throw new Error('无法锁定资料库，请稍后重试。');
}

export function isLocalURL(value, origin) {
  try {
    return new URL(value).origin === origin;
  } catch {
    return false;
  }
}
export function isExternalURL(value) {
  try {
    return ['https:', 'http:'].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}
