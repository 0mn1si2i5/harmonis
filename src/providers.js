import JSONbigFactory from 'json-bigint';
import fs from 'node:fs/promises';
import { UserError } from './contracts.js';
const big = JSONbigFactory({ useNativeBigInt: true, alwaysParseAsBig: false });
export const parseAPI = s => big.parse(s);
export const stringifyAPI = o => big.stringify(o);
export function publicJSON(o) {
  return JSON.parse(JSON.stringify(o, (_, v) => (typeof v === 'bigint' ? v.toString() : v)));
}
export const minimaxKeyType = key =>
  !key
    ? 'missing'
    : key.startsWith('sk-cp-')
      ? 'subscription'
      : key.startsWith('sk-api-')
        ? 'payg'
        : 'unknown';
export function safeError(error, keys = {}) {
  let msg =
    error?.name === 'TimeoutError'
      ? '请求超时，远端可能已处理，结果未知；请核对供应商记录后决定是否重试。'
      : error?.message || '操作失败';
  for (const key of Object.values(keys))
    if (typeof key === 'string' && key.length > 5) msg = msg.replaceAll(key, '[已隐藏]');
  return msg.slice(0, 1000);
}
export function normalizeSubtitles(raw) {
  const list = Array.isArray(raw) ? raw : Array.isArray(raw?.subtitles) ? raw.subtitles : null;
  if (!list) return null;
  const out = list
    .map(s => ({ text: String(s.text ?? '').trim(), begin: Number(s.time_begin), end: Number(s.time_end) }))
    .filter(s => s.text && Number.isFinite(s.begin) && Number.isFinite(s.end) && s.end >= s.begin);
  return out.length ? out : null;
}
export function createProviders(getKeys, transport = fetch) {
  const key = name => {
    const k = getKeys()[name];
    if (!k)
      throw new UserError(`请先在服务设置中填写 ${name === 'minimax' ? 'MiniMax' : 'ElevenLabs'} API Key`);
    return k;
  };
  async function minimax(endpoint, body, form) {
    const response = await transport('https://api.minimax.cn/v1/' + endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key('minimax')}`,
        ...(!form ? { 'Content-Type': 'application/json' } : {}),
      },
      body: form || stringifyAPI(body),
      signal: AbortSignal.timeout(240000),
      redirect: 'error',
    });
    const text = await response.text();
    let data;
    try {
      data = parseAPI(text);
    } catch {
      throw new UserError(`MiniMax 返回非 JSON 响应（HTTP ${response.status}）`, 502);
    }
    if (!response.ok || data.base_resp?.status_code !== 0)
      throw new UserError(
        `MiniMax：${data.base_resp?.status_msg || '请求失败'}（${data.base_resp?.status_code ?? response.status}）${data.trace_id ? ' · ' + data.trace_id : ''}`,
        502
      );
    return data;
  }
  // 字幕文件是 MiniMax 给的下载链接（JSON，句级，毫秒）。拿不到不影响音频，只是这一版没有字幕。
  async function subtitles(url) {
    try {
      if (!/^https:\/\//.test(url)) return null;
      const res = await transport(url, { signal: AbortSignal.timeout(30000), redirect: 'follow' });
      if (!res.ok) return null;
      return normalizeSubtitles(JSON.parse(await res.text()));
    } catch {
      return null;
    }
  }
  return {
    minimax,
    async upload(file, purpose) {
      const form = new FormData();
      form.append('purpose', purpose);
      form.append('file', new Blob([await fs.readFile(file)], { type: 'audio/wav' }), 'recording.wav');
      const result = await minimax('files/upload', null, form);
      if (!result.file?.file_id) throw new UserError('MiniMax 未返回上传文件 ID', 502);
      return BigInt(String(result.file.file_id));
    },
    async speech(body) {
      const data = await minimax('t2a_v2', body);
      if (!data.data?.audio || !/^(?:[a-f0-9]{2})+$/i.test(data.data.audio))
        throw new UserError('MiniMax 未返回有效的音频数据', 502);
      return {
        bytes: Buffer.from(data.data.audio, 'hex'),
        usage: publicJSON(data.extra_info || {}),
        traceId: data.trace_id,
        subtitles: data.data.subtitle_file ? await subtitles(String(data.data.subtitle_file)) : null,
      };
    },
    async music({ body, format }) {
      const res = await transport(
        'https://api.elevenlabs.io/v1/music?output_format=' + encodeURIComponent(format),
        {
          method: 'POST',
          headers: { 'xi-api-key': key('elevenlabs'), 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(600000),
          redirect: 'error',
        }
      );
      if (!res.ok) {
        let d;
        try {
          d = await res.json();
        } catch {}
        throw new UserError(
          `ElevenLabs：${typeof d?.detail === 'string' ? d.detail : d?.detail?.message || res.statusText || '请求失败'}（${res.status}）`,
          502
        );
      }
      if (!(res.headers.get('content-type') || '').match(/audio|octet-stream/))
        throw new UserError('ElevenLabs 未返回音频文件', 502);
      return {
        bytes: Buffer.from(await res.arrayBuffer()),
        requestId: res.headers.get('request-id'),
        songId: res.headers.get('song-id'),
      };
    },
    async test(provider) {
      if (provider === 'minimax') {
        await minimax('get_voice', { voice_type: 'voice_cloning' });
        return minimaxKeyType(key('minimax')) === 'subscription'
          ? 'MiniMax 密钥已通过音色查询。当前是订阅 Key，使用 M Plan / 积分额度，不会使用按量钱包余额；如需使用钱包，请换成按量 API Key。克隆权限以实际调用为准。'
          : 'MiniMax 密钥已通过音色查询；克隆认证及计费权限仍以实际调用为准。';
      }
      const res = await transport('https://api.elevenlabs.io/v1/user', {
        headers: { 'xi-api-key': key('elevenlabs') },
        signal: AbortSignal.timeout(20000),
        redirect: 'error',
      });
      if (!res.ok)
        throw new UserError(
          `ElevenLabs 验证失败（${res.status}）；受限 Key 可能没有 user_read 权限，音乐权限需实际调用确认。`
        );
      return 'ElevenLabs 密钥已通过用户查询；音乐套餐与权限以实际账户为准。';
    },
  };
}
