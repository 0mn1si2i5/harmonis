import test from 'node:test';
import assert from 'node:assert/strict';
import { Recorder } from '../public/js/recorder.js';
test('closing while microphone permission is pending releases late stream', async t => {
  let resolve,
    stops = 0;
  const old = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const oldWindow = globalThis.window;
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { mediaDevices: { getUserMedia: () => new Promise(r => (resolve = r)) } },
  });
  globalThis.window = { MediaRecorder: class {} };
  t.after(() => {
    if (old) Object.defineProperty(globalThis, 'navigator', old);
    else delete globalThis.navigator;
    globalThis.window = oldWindow;
  });
  const r = new Recorder(() => {});
  const pending = r.start();
  r.stop();
  resolve({
    getTracks: () => [
      {
        stop() {
          stops++;
        },
      },
    ],
  });
  await pending;
  assert.equal(stops, 1);
  assert.equal(r.media, undefined);
});
test('recorder constructor failure releases the granted microphone', async t => {
  let stops = 0;
  const old = Object.getOwnPropertyDescriptor(globalThis, 'navigator'),
    oldWindow = globalThis.window,
    oldRecorder = globalThis.MediaRecorder;
  const BadRecorder = class {
    static isTypeSupported() {
      return true;
    }
    constructor() {
      throw new Error('unsupported codec');
    }
  };
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      mediaDevices: {
        getUserMedia: async () => ({
          getTracks: () => [
            {
              stop() {
                stops++;
              },
            },
          ],
        }),
      },
    },
  });
  globalThis.window = { MediaRecorder: BadRecorder };
  globalThis.MediaRecorder = BadRecorder;
  t.after(() => {
    if (old) Object.defineProperty(globalThis, 'navigator', old);
    else delete globalThis.navigator;
    globalThis.window = oldWindow;
    globalThis.MediaRecorder = oldRecorder;
  });
  await assert.rejects(new Recorder(() => {}).start(), /unsupported codec/);
  assert.equal(stops, 1);
});
