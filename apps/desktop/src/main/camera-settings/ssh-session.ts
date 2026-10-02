import { Client } from 'ssh2';
import { t } from '../../shared/i18n/index.js';

export interface SshLogin {
  host: string;
  username: string;
  password: string;
}

export interface ScriptResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

export class SshSession {
  private alive = true;

  private constructor(private readonly client: Client) {
    client.on('error', () => { this.alive = false; });
    client.on('close', () => { this.alive = false; });
  }

  get isAlive(): boolean {
    return this.alive;
  }

  static open(login: SshLogin, timeoutMs = 8000): Promise<SshSession> {
    return new Promise((resolve, reject) => {
      const client = new Client();
      client
        .once('ready', () => {
          client.removeListener('error', reject);
          resolve(new SshSession(client));
        })
        .once('error', reject)
        .connect({
          host: login.host,
          port: 22,
          username: login.username,
          password: login.password,
          // dropbear on OpenIPC also offers keyboard-interactive; answer it with the same password.
          tryKeyboard: true,
          readyTimeout: timeoutMs,
          // A camera on the bench has no known host key to pin; reflashing changes it anyway.
          hostVerifier: () => true,
        })
        .on('keyboard-interactive', (_name, _instr, _lang, prompts, finish) => {
          finish(prompts.map(() => login.password));
        });
    });
  }

  /** Runs a script with `sh -s`, so it never passes through another layer of quoting. */
  run(script: string, timeoutMs = 15000): Promise<ScriptResult> {
    return new Promise((resolve, reject) => {
      this.client.exec('sh -s', (err, stream) => {
        if (err) { reject(err); return; }
        let stdout = '';
        let stderr = '';
        const timer = setTimeout(() => {
          stream.close();
          reject(new Error(t('main:cameraSettings.stoppedResponding')));
        }, timeoutMs);
        stream.on('data', (d: Buffer) => { stdout += d.toString(); });
        stream.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
        stream.on('close', (code: number | null) => {
          clearTimeout(timer);
          resolve({ code, stdout, stderr });
        });
        stream.end(script);
      });
    });
  }

  close(): void {
    this.client.end();
  }
}

export function describeSshError(err: unknown, host: string): string {
  const e = err as { code?: string; level?: string; message?: string };
  if (e.level === 'client-authentication') return t('main:cameraSettings.loginRejected');
  if (e.code === 'ECONNREFUSED') return t('main:cameraSettings.notAcceptingSsh', { host });
  if (e.code === 'ETIMEDOUT' || e.code === 'EHOSTUNREACH' || /timed out/i.test(e.message ?? '')) {
    return t('main:cameraSettings.noAnswer', { host });
  }
  if (e.code === 'ENOTFOUND') return t('main:cameraSettings.hostNotFound', { host });
  return e.message ?? t('main:cameraSettings.unreachable');
}
