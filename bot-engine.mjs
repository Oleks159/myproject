import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export class BotEngine {
  constructor(root, dataDirectory) {
    this.root = root;
    this.dataDirectory = dataDirectory;
    this.pending = new Map();
  }
  start() {
    if (this.ready) return this.ready;
    const bundled = join(process.env.USERPROFILE || '', '.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe');
    const python = process.env.TPF_PYTHON || (existsSync(bundled) ? bundled : process.platform === 'win32' ? 'python' : 'python3');
    this.ready = new Promise((resolve, reject) => {
      const child = spawn(python, ['-B', '-u', join(this.root, 'bot_engine/worker.py')], {
        cwd: this.root, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, OPENBLAS_NUM_THREADS: '1', OMP_NUM_THREADS: '1', PYTHONUTF8: '1', TPF_BOT_DATA_DIR: join(this.dataDirectory, 'bot_tables') }
      });
      this.child = child;
      const startupTimer = setTimeout(() => { fail(); child.kill(); }, 30000);
      const fail = () => {
        if (this.child !== child) return;
        clearTimeout(startupTimer);
        const error = Object.assign(new Error('Bot-Engine nicht erreichbar. Bitte Python und die lokalen Modelle prüfen.'), { status: 503 });
        this.ready = null; this.child = null;
        for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); }
        this.pending.clear(); reject(error);
      };
      child.on('error', fail); child.on('exit', fail);
      child.stderr.on('data', chunk => process.stderr.write(chunk));
      createInterface({ input: child.stdout }).on('line', line => {
        let message;
        try { message = JSON.parse(line); } catch { return; }
        if (message.ready) { clearTimeout(startupTimer); resolve(); return; }
        const pending = this.pending.get(message.id);
        if (!pending) return;
        clearTimeout(pending.timer); this.pending.delete(message.id);
        if (message.error) pending.reject(Object.assign(new Error(message.error), { status: message.status || 500 }));
        else pending.resolve(message.result);
      });
    });
    return this.ready;
  }
  async request(operation, account, tier, payload = {}) {
    await this.start();
    if (this.pending.size >= 64) throw Object.assign(new Error('Bot-Tische sind gerade ausgelastet.'), { status: 503 });
    return new Promise((resolve, reject) => {
      const id = randomUUID();
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(Object.assign(new Error('Der Zug wird noch berechnet. Zustand neu laden; dieselbe Anfrage kann sicher wiederholt werden.'), { status: 504 }));
      }, 30000);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(JSON.stringify({ id, operation, account, tier, payload }) + '\n', error => {
        if (error) { clearTimeout(timer); this.pending.delete(id); reject(Object.assign(error, { status: 503 })); }
      });
    });
  }
  close() { this.child?.kill(); }
}
