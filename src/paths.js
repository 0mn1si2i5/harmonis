import os from 'node:os';
import path from 'node:path';
export function defaultDataDir() {
  const base =
    process.platform === 'darwin'
      ? path.join(os.homedir(), 'Library', 'Application Support')
      : process.platform === 'win32'
        ? process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
        : process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');
  return path.join(base, 'Harmonis', 'library');
}
export const dataDirectory = () =>
  process.env.HARMONIS_DATA_DIR || process.env.SHENGJIAN_DATA_DIR || defaultDataDir();
export function mediaExecutable(command) {
  const explicit = command === 'ffmpeg' ? process.env.HARMONIS_FFMPEG : process.env.HARMONIS_FFPROBE;
  if (explicit) return explicit;
  return process.env.HARMONIS_MEDIA_DIR ? path.join(process.env.HARMONIS_MEDIA_DIR, command) : command;
}
