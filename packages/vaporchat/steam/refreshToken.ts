import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// one file per account so several users can share a data dir
function tokenPath(dataDir: string, accountName: string) {
  return join(dataDir, `steam-refresh-token-${accountName.toLowerCase()}`);
}

export async function loadRefreshToken(
  dataDir: string,
  accountName: string,
): Promise<string | null> {
  try {
    return (await readFile(tokenPath(dataDir, accountName), 'utf8')).trim();
  } catch (err) {
    if (err instanceof Error && 'code' in err && err.code === 'ENOENT') {
      return null;
    }
    throw err;
  }
}

export async function saveRefreshToken(
  dataDir: string,
  accountName: string,
  refreshToken: string,
) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(tokenPath(dataDir, accountName), refreshToken, {
    mode: 0o600,
  });
}

export async function deleteRefreshToken(dataDir: string, accountName: string) {
  await rm(tokenPath(dataDir, accountName), { force: true });
}
