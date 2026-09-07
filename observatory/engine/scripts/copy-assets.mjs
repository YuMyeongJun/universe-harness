/**
 * `src/**` 의 **비-TS 자산**(프롬프트 .md 등)을 `dist/` 로 같은 구조로 옮긴다.
 *
 * 왜 필요한가: 판정·추출 프롬프트는 런타임에 `import.meta.url` 기준 경로로 읽힌다.
 * tsc 는 .ts 만 내보내므로, 이 스크립트가 없으면 **빌드된 패키지에서 프롬프트가 사라진다**
 * (그리고 그 사실은 판정 레인을 실제로 부를 때까지 안 드러난다).
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const src = path.resolve('src');
const dist = path.resolve('dist');

const walk = async (dir) => {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const full = path.join(dir, entry.name);
      return entry.isDirectory() ? walk(full) : [full];
    }),
  );
  return files.flat();
};

const copied = [];
for (const file of await walk(src)) {
  if (/\.tsx?$/.test(file)) {
    continue;
  }
  const target = path.join(dist, path.relative(src, file));
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.copyFile(file, target);
  copied.push(path.relative(dist, target));
}

console.log(`자산 ${copied.length}개 복사${copied.length ? `: ${copied.join(' · ')}` : ' (없음)'}`);
