import { spawn } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

/**
 * Unpack an app archive.
 *
 * NOT `module-extract`'s adm-zip path, for two reasons that both silently produce a broken
 * install rather than an error:
 *
 *  - adm-zip reads the WHOLE archive into a Buffer. A cargo bundle is a few megabytes of
 *    JavaScript; an app is the entire program, which for the Trainer is ~500 MB compressed.
 *  - adm-zip writes a stored SYMLINK as a regular file containing its target path. The Trainer
 *    ships a conda environment whose `bin/python` is a symlink to `python3.11`, so extracting
 *    it that way yields a toolchain that cannot start and an error that points nowhere near
 *    the extractor.
 *
 * Each platform's own tool handles both correctly, streams from disk, and is already installed.
 */
export async function extractAppArchive(zipPath: string, targetDir: string): Promise<void> {
  const abs = resolve(targetDir);
  await rm(abs, { recursive: true, force: true });
  await mkdir(abs, { recursive: true });

  const [cmd, args] =
    process.platform === 'darwin'
      // ditto, not unzip: it is the only one that also carries an app bundle's extended
      // attributes across, and a quarantined .app that loses them fails to launch with a
      // Gatekeeper error rather than an extraction one.
      ? ['ditto', ['-x', '-k', zipPath, abs]]
      : process.platform === 'win32'
        ? ['powershell', [
            '-NoProfile', '-NonInteractive', '-Command',
            `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' ` +
            `-DestinationPath '${abs.replace(/'/g, "''")}' -Force`,
          ]]
        : ['unzip', ['-q', '-o', zipPath, '-d', abs]];

  await new Promise<void>((ok, fail) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr?.on('data', (d) => { err += String(d); });
    p.on('error', fail);
    p.on('close', (code) =>
      code === 0 ? ok() : fail(new Error(`${cmd} failed (${code}): ${err.trim()}`)), // i18n-exempt
    );
  });
}
