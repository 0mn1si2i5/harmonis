import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
for (const root of ['src', 'public', 'tests', 'scripts', 'desktop']) {
  for (const entry of await readdir(new URL('../' + root + '/', import.meta.url), { recursive: true })) {
    if (!/\.[cm]?js$/.test(entry)) continue;
    const file = new URL('../' + root + '/' + entry, import.meta.url);
    const result = spawnSync(process.execPath, ['--check', fileURLToPath(file)], { stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}
