const fs = require('fs');
const path = require('path');

module.exports = async function afterPack({ electronPlatformName, appOutDir }) {
  if (electronPlatformName !== 'linux') return;

  // electron-builder derives the exec name from package name "@ardudeck/desktop" → "@ardudeckdesktop"
  const execName = '@ardudeckdesktop';
  const execPath = path.join(appOutDir, execName);
  const binPath = path.join(appOutDir, `${execName}.bin`);

  await fs.promises.rename(execPath, binPath);
  await fs.promises.writeFile(execPath, [
    '#!/bin/bash',
    `exec "\${BASH_SOURCE%/*}/${execName}.bin" --no-sandbox "$@"`,
    ''
  ].join('\n'));
  await fs.promises.chmod(execPath, 0o755);
};
