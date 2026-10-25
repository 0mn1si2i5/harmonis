import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createApp } from '../src/server.js';
import { acquireLibraryLock, migrateLegacyLibrary, isLocalURL, isExternalURL } from '../desktop/runtime.js';

async function directory(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'harmonis-desktop-test-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return dir;
}
test('desktop service requires its private session cookie and still rejects cross-site writes', async t => {
  const dir = await directory(t);
  const { app } = createApp({ dataDir: dir, sessionToken: 'isolated-test-token' });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  t.after(() => new Promise(r => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(base + '/api/state')).status, 403);
  const headers = {
    Cookie: 'harmonis-session=isolated-test-token',
    'X-Harmonis': '1',
    'Content-Type': 'application/json',
  };
  assert.equal((await fetch(base + '/api/state', { headers })).status, 200);
  const page = await fetch(base, { headers });
  assert.match(page.headers.get('content-security-policy'), /object-src 'none'/);
  assert.equal(
    (
      await fetch(base + '/api/projects', {
        method: 'POST',
        headers: { ...headers, Origin: 'https://example.org' },
        body: '{}',
      })
    ).status,
    403
  );
});
test('legacy library migration copies voices and keys without overwriting either library', async t => {
  const dir = await directory(t),
    legacy = path.join(dir, 'Shengjian'),
    current = path.join(dir, 'Harmonis', 'library');
  await fs.mkdir(legacy);
  await fs.writeFile(path.join(legacy, 'library.json'), JSON.stringify({ voices: [{ name: 'Test voice' }] }));
  await fs.writeFile(path.join(legacy, 'settings.json'), '{"minimax":"test-only"}');
  assert.equal(await migrateLegacyLibrary(legacy, current), true);
  assert.equal(await fs.readFile(path.join(current, 'settings.json'), 'utf8'), '{"minimax":"test-only"}');
  assert.equal((await fs.stat(path.join(current, 'settings.json'))).mode & 0o777, 0o600);
  await fs.writeFile(path.join(current, 'library.json'), '{}');
  assert.equal(await migrateLegacyLibrary(legacy, current), false);
  assert.equal(await fs.readFile(path.join(current, 'library.json'), 'utf8'), '{}');
  assert.match(await fs.readFile(path.join(legacy, 'library.json'), 'utf8'), /Test voice/);
});
test('migration does not erase an existing incomplete data directory', async t => {
  const dir = await directory(t),
    legacy = path.join(dir, 'legacy'),
    current = path.join(dir, 'current');
  await fs.mkdir(legacy);
  await fs.mkdir(current);
  await fs.writeFile(path.join(legacy, 'library.json'), '{}');
  await fs.writeFile(path.join(current, 'keep.wav'), 'keep');
  await assert.rejects(migrateLegacyLibrary(legacy, current), /未覆盖/);
  assert.equal(await fs.readFile(path.join(current, 'keep.wav'), 'utf8'), 'keep');
});
test('library lock prevents concurrent writers and releases cleanly', async t => {
  const dir = await directory(t);
  const release = await acquireLibraryLock(dir);
  await assert.rejects(acquireLibraryLock(dir), /正在使用/);
  await release();
  const second = await acquireLibraryLock(dir);
  await second();
});
test('desktop URL boundaries allow only own origin and external http(s)', () => {
  assert.equal(isLocalURL('http://127.0.0.1:4318/api/state', 'http://127.0.0.1:4318'), true);
  assert.equal(isLocalURL('http://127.0.0.1:4317/', 'http://127.0.0.1:4318'), false);
  assert.equal(isExternalURL('https://platform.minimax.cn/console/access'), true);
  assert.equal(isExternalURL('file:///etc/passwd'), false);
  assert.equal(isExternalURL('javascript:alert(1)'), false);
});
