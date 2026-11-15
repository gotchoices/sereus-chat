/**
 * A phone's app log (ReactNativeJS), read from its log buffer every 10 s and kept in order, so a
 * buffer that wraps (5 MiB on the S21, shared with every other app) loses nothing. A logcat
 * streamed over adb would die when Maestro restarts adb. Lines holding a node code or a link are
 * dropped as they are read.
 *
 *   const log = collectLogcat(adbPath, serial); …; await log.stop(path)
 */
import { spawn, spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

export function collectLogcat(adb, serial) {
  spawnSync(adb, ['-s', serial, 'logcat', '-G', '16M'], { stdio: 'ignore' });
  spawnSync(adb, ['-s', serial, 'logcat', '-c'], { stdio: 'ignore' });
  const seen = new Set();
  const lines = [];
  const dump = () => new Promise(resolve => {
    const p = spawn(adb, ['-s', serial, 'logcat', '-d', '-v', 'time', '-s', 'ReactNativeJS:V']);
    let raw = '';
    p.stdout.on('data', c => { raw += c; });
    p.on('close', () => resolve(raw));
    p.on('error', () => resolve(''));
  });
  const collect = async () => {
    for (const line of (await dump()).split('\n')) {
      if (!line.trim() || line.startsWith('---------') || seen.has(line)) continue;
      seen.add(line);
      if (!/sereus-join|https?:\/\/|chat:\/\/invite/.test(line)) lines.push(line);
    }
  };
  const timer = setInterval(() => { void collect(); }, 10_000);
  return {
    async stop(path) {
      clearInterval(timer);
      await collect();
      writeFileSync(path, [...lines].sort().join('\n'));
      return lines.length;
    },
  };
}
