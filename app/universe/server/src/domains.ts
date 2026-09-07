/**
 * 도메인 스캔 — 지식이 **얼마나 채워졌는지**를 재서 화면에 띄운다.
 *
 * ⚠️ 판정 어휘가 셋인 이유는 이 저장소의 규율과 같다(`tc-lint` 의 0/1/3):
 *    `filled`(작성됨) · `partial`(일부) · `stub`(골격만). **"비었음"을 "괜찮음"으로 세지 않는다.**
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { domainsDir } from './paths.js';

export type Fill = 'filled' | 'partial' | 'stub';

export interface IDomainSummary {
  domain: string;
  title: string;
  docs: number;
  bytes: number;
  /** `_TBD` 가 남아 있는 문서 수 — 이게 0 이 아니면 완성이 아니다 */
  tbdDocs: number;
  /** `features/{LNB}/` 폴더 수. TC 대분류로 매핑되는 단위다 */
  lnbFolders: number;
  fill: Fill;
}

/** 도메인 폴더의 `CLAUDE.md` 첫 제목에서 한글 이름을 얻는다. 없으면 식별자 그대로. */
const titleOf = (dir: string, domain: string): string => {
  try {
    const head = readFileSync(join(dir, 'CLAUDE.md'), 'utf8').split(/\r?\n/)[0] ?? '';
    const m = /^#\s*(.+?)\s*$/.exec(head);
    // `# 헤이데어 (\`heythere\`)` · `# 아이비플로우 · 기능` 둘 다 이름만 남긴다
    if (m?.[1]) return m[1].replace(/\s*·.*$/, '').replace(/\s*[(（].*$/, '').trim();
  } catch {
    /* CLAUDE.md 가 없어도 스캔은 계속한다 */
  }
  return domain;
};

const walk = (dir: string, out: string[] = []): string[] => {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name.startsWith('.') || e.name === 'node_modules') continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (e.name.endsWith('.md')) out.push(full);
  }
  return out;
};

const summarize = (root: string, domain: string): IDomainSummary => {
  const dir = join(root, domain);
  const files = walk(dir);
  let bytes = 0;
  let tbdDocs = 0;
  for (const f of files) {
    try {
      const src = readFileSync(f, 'utf8');
      bytes += Buffer.byteLength(src, 'utf8');
      if (/_TBD/.test(src)) tbdDocs += 1;
    } catch {
      /* 읽지 못한 파일은 크기 0 으로 두되 문서 수에는 남긴다 */
    }
  }

  let lnbFolders = 0;
  try {
    lnbFolders = readdirSync(join(dir, 'knowledge/features'), { withFileTypes: true }).filter(
      // 언더스코어 접두는 비-LNB 영역이다 (`_common`·`_enduser`) — 대분류로 세지 않는다
      (e) => e.isDirectory() && !e.name.startsWith('_'),
    ).length;
  } catch {
    lnbFolders = 0;
  }

  // 골격 판정은 **분량이 아니라 미작성 표시**를 우선한다.
  // 전 문서가 _TBD 면 아무리 파일이 많아도 골격이다.
  const fill: Fill =
    files.length > 0 && tbdDocs === files.length ? 'stub' : tbdDocs > 0 ? 'partial' : 'filled';

  return { domain, title: titleOf(dir, domain), docs: files.length, bytes, tbdDocs, lnbFolders, fill };
};

export const listDomains = (): IDomainSummary[] => {
  const root = domainsDir();
  let names: string[];
  try {
    names = readdirSync(root, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
      // macOS 파일시스템은 한글을 NFD 로 줄 수 있다. 들어오는 자리에서 NFC 로 한 번 맞춘다.
      .map((e) => e.name.normalize('NFC'));
  } catch {
    return [];
  }
  return names.map((n) => summarize(root, n)).sort((a, b) => a.bytes - b.bytes);
};

export const domainExists = (domain: string): boolean => {
  try {
    return statSync(join(domainsDir(), domain)).isDirectory();
  } catch {
    return false;
  }
};
