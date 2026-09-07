#!/usr/bin/env node
/**
 * **빌드가 어느 소스에서 나왔는지 도장을 찍는다.**
 *
 * ⚠️⚠️ 실측(R81): `dist` 는 gitignore 이고 **selftest 는 소스를, 관측은 dist 를** 읽는다 —
 * 소스를 고치고 안 빌드하면 **두 진실**이 생긴다(관측이 옛 규칙으로 초록불을 냈다).
 * ⛔ 처음엔 **mtime** 으로 재려 했는데 **변이 시험이 소스를 복원하면서 시각을 새로 찍어** 속았다.
 * ⇒ **내용으로 잰다.** 빌드가 자기 입력의 지문을 남기고, 검사는 그 지문을 지금 소스와 견준다.
 */
import { readdir, readFile, writeFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';

export const sourceFingerprint = async (packagesDir) => {
  const files = [];
  const walk = async (dir) => {
    for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      if (entry.name === 'node_modules' || entry.name === 'dist') { continue; }
      const full = join(dir, entry.name);
      if (entry.isDirectory()) { await walk(full); }
      else if (full.includes(`${'/'}src${'/'}`) && full.endsWith('.ts')) { files.push(full); }
    }
  };
  await walk(packagesDir);
  files.sort();
  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(file.slice(packagesDir.length));
    hash.update(await readFile(file));
  }
  return `${files.length}:${hash.digest('hex').slice(0, 16)}`;
};

const HERE = resolve(new URL('.', import.meta.url).pathname);
if (process.argv[1] && import.meta.filename === process.argv[1]) {
  const stamp = await sourceFingerprint(join(HERE, 'packages'));
  await writeFile(join(HERE, '.build-stamp'), `${stamp}\n`, 'utf8');
  console.log(`🔖 빌드 도장 — ${stamp}`);
}
void stat;
