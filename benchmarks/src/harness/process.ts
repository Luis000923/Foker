import { spawn, spawnSync } from 'node:child_process';
export interface ProcessResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
}
export function execute(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
  onTimeout?: () => Promise<void>,
  env: NodeJS.ProcessEnv = process.env,
): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, shell: false, env });
    let stdout = '',
      stderr = '',
      timedOut = false;
    let cleanup = Promise.resolve();
    child.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });
    child.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });
    const timer = setTimeout(() => {
      timedOut = true;
      cleanup = onTimeout?.() ?? Promise.resolve();
      child.kill('SIGKILL');
    }, timeoutMs);
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (exitCode) => {
      clearTimeout(timer);
      void cleanup.then(() => resolve({ stdout, stderr, exitCode, timedOut }), reject);
    });
  });
}
export function detectRuntime(): string {
  for (const name of ['docker', 'podman']) if (spawnSync(name, ['info'], { stdio: 'ignore' }).status === 0) return name;
  throw new Error('Docker o Podman disponible es obligatorio');
}
