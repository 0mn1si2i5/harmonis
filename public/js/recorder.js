export class Recorder {
  // onLevel 可选：大约每 50 毫秒收到一次 { rms, peak, maxPeak }（dBFS）
  constructor(update, onLevel) {
    this.update = update;
    this.onLevel = onLevel;
    this.elapsed = 0;
    this.blob = null;
  }
  async start() {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder)
      throw new Error('浏览器不支持录音，请使用新版 Chrome 或 Safari，或直接上传已有音频。');
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    if (this.cancelled) {
      this.cleanup();
      return;
    }
    this.parts = [];
    this.elapsed = 0;
    this.blob = null;
    this.meter();
    try {
      const mime = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find(v =>
        MediaRecorder.isTypeSupported(v)
      );
      this.media = new MediaRecorder(this.stream, mime ? { mimeType: mime } : {});
      this.media.ondataavailable = e => {
        if (e.data.size) this.parts.push(e.data);
      };
      this.media.onstop = () => {
        this.blob = new Blob(this.parts, { type: this.media.mimeType });
        this.cleanup();
        this.update({ state: 'stopped', elapsed: this.elapsed, blob: this.blob });
      };
      this.media.onerror = () => {
        this.cleanup();
        this.update({ state: 'error', error: '录音被中断，请重录或上传音频。' });
      };
      this.media.start(250);
      this.update({ state: 'recording', elapsed: 0 });
      this.timer = setInterval(() => {
        if (this.media.state === 'recording') this.elapsed += 0.25;
        this.update({ state: this.media.state, elapsed: this.elapsed });
        if (this.elapsed >= 300) this.stop();
      }, 250);
    } catch (e) {
      this.cleanup();
      throw e;
    }
  }
  pause() {
    if (this.media?.state === 'recording') this.media.pause();
    else if (this.media?.state === 'paused') this.media.resume();
    this.update({ state: this.media.state, elapsed: this.elapsed });
  }
  stop() {
    this.cancelled = true;
    if (this.media && this.media.state !== 'inactive') this.media.stop();
    else this.cleanup();
  }
  meter() {
    const AC = globalThis.window?.AudioContext || globalThis.window?.webkitAudioContext;
    if (!AC || !this.onLevel) return;
    try {
      this.ctx = new AC();
      const analyser = this.ctx.createAnalyser();
      analyser.fftSize = 2048;
      this.ctx.createMediaStreamSource(this.stream).connect(analyser);
      const buf = new Float32Array(analyser.fftSize);
      const db = v => (v > 0 ? 20 * Math.log10(v) : -Infinity);
      this.maxPeak = -Infinity;
      this.levelTimer = setInterval(() => {
        analyser.getFloatTimeDomainData(buf);
        let peak = 0,
          sum = 0;
        for (const x of buf) {
          peak = Math.max(peak, Math.abs(x));
          sum += x * x;
        }
        if (this.media?.state === 'recording') this.maxPeak = Math.max(this.maxPeak, db(peak));
        this.onLevel({ rms: db(Math.sqrt(sum / buf.length)), peak: db(peak), maxPeak: this.maxPeak });
      }, 50);
    } catch {
      this.ctx = null;
    }
  }
  cleanup() {
    clearInterval(this.timer);
    clearInterval(this.levelTimer);
    this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.stream?.getTracks().forEach(t => t.stop());
  }
}
