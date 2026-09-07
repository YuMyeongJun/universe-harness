/**
 * 지식 md 생성 — 실측 초안을 **채워진 도메인과 같은 형식**으로 낸다.
 *
 * ⭐ 이 파일이 지키는 것 셋:
 *
 *  ① **미확인은 미확인으로 적는다.** 확인 안 된 항목을 빼 버리면 문서가 "완성된 것처럼"
 *     보인다. 그건 이 저장소가 가장 싫어하는 실패다 — 안 잰 것이 통과로 세어진다.
 *     그래서 `_미실측_` 로 **이름을 달고 남는다.**
 *
 *  ② **실측일을 박는다.** 지식이 낡았다는 신호가 없으면, 8월에 잰 문서와 어제 잰 문서가
 *     읽는 쪽에서 똑같이 보인다. 실제 정정 사례가 전부 그 자리에서 났다.
 *
 *  ③ **계정 정보는 절대 안 나간다.** 수집에만 쓰고 문서에는 넣지 않으며,
 *     넣지 않았다는 것을 나가기 전에 **기계로 확인**한다(`assertNoCredentials`).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { domainsDir } from './paths.js';
import type { ISurvey, ISurveyItem } from './survey.js';

export interface IEmitFile {
  /** 저장소 루트 기준 상대경로 — 화면에도 이 형태로 보인다 */
  path: string;
  content: string;
  /** 이미 있는 파일인가, 그리고 그게 골격(`_TBD`)인가 */
  exists: boolean;
  isStub: boolean;
}

const KEPT = (i: ISurveyItem): boolean => i.status === 'confirmed' || i.status === 'corrected';

/** 폴더명은 **공백·괄호를 뺀 형태**다 — 채워진 도메인의 규약(`에이전트(챗봇) 리스트` → `에이전트리스트`). */
export const folderName = (label: string): string =>
  label
    .normalize('NFC')
    .replace(/[()[\]{}]/g, '')
    .replace(/\s+/g, '')
    .replace(/[\\/:*?"<>|]/g, '');

const dateOf = (iso: string | null): string => (iso ? iso.slice(0, 10) : '미실측');

/**
 * 문서에 자격증명이 섞이지 않았는지 **나가기 전에** 확인한다.
 * 일반 탐지기가 아니라 **이 초안이 실제로 들고 있는 값**과 대조하므로 오탐이 없다.
 */
export const assertNoCredentials = (survey: ISurvey, files: IEmitFile[]): void => {
  const secrets = [survey.entry.accountId, survey.entry.accountPw]
    .map((v) => v.trim())
    .filter((v) => v.length >= 4);
  if (secrets.length === 0) return;
  for (const f of files) {
    for (const s of secrets) {
      if (f.content.includes(s)) {
        throw new Error(
          `⛔ 생성 문서에 계정 정보가 섞였습니다: ${f.path}\n` +
            '계정은 수집에만 쓰고 지식 문서에는 넣지 않습니다. 초안의 메모·상세 칸을 확인하세요.',
        );
      }
    }
  }
};

/**
 * ⭐ **「말한 것」과 「잰 것」을 같은 칸에 넣지 않는다.**
 *
 * 이 표의 항목은 전부 **사람이 「확인했다」고 말한 것**이다 — 기계가 잰 것이 아니다.
 * 기계가 잰 것은 수집 시점의 도달 신호(본문 길이·요소 수)뿐이고, 그건 **스캔 단위**라
 * 항목 하나하나를 뒷받침하지 못한다.
 *
 * 뒷받침 재료(모수 · 주체 · 시각 · 커밋)가 항목 단위로 갖춰지기 전까지는 **승격하지 않는다.**
 * 재료가 없는 것은 결함이지만, **없는 것을 있는 것처럼 보이게 두는 것은 다른 종류의 결함**이다.
 * 그래서 지금 할 수 있는 최소한을 한다 — **표시해서 갈라 놓는다.**
 */
const lnbTable = (items: ISurveyItem[]): string => {
  const kept = items.filter((i) => i.kind === 'lnb' && KEPT(i));
  if (kept.length === 0) {
    return '_미실측 — 확인된 LNB 메뉴가 아직 없습니다._\n';
  }
  const rows = kept
    .map((i, n) => {
      const folder = folderName(i.label);
      const url = i.url.trim() === '' ? '_미실측_' : `\`${i.url}\``;
      // 자동 수집을 사람이 확인한 것과, 사람이 처음부터 적어 넣은 것을 구별한다.
      const basis = i.origin === 'auto' ? '수집→사람확인' : '사람이 직접 적음';
      // 주체·시각이 없으면 **비워 두지 않고 그렇게 적는다.** 빈 칸은 "해당없음"으로 읽힌다.
      const who =
        i.decidedBy !== undefined && i.decidedAt !== undefined
          ? `${i.decidedBy} · ${i.decidedAt.slice(0, 10)}`
          : '_기록 없음_';
      return `| ${n + 1} | ${i.label} | ${url} | 🧑 ${basis} | ${who} | [\`features/${folder}/${folder}_main.md\`](./features/${folder}/${folder}_main.md) |`;
    })
    .join('\n');
  return (
    `> 🧑 **아래는 기계가 잰 것이 아니라 사람이 「확인했다」고 말한 것이다.**\n` +
    `> 누가·언제 판정했는지는 남지만, **그 판정이 맞는지는 기계가 재지 않았다.**\n` +
    `> 항목별 도달 증거(그 화면에 실제로 갔는가·스크린샷 지문)는 **아직 이 도구가 기록하지 않는다.**\n` +
    `> 그 재료가 붙기 전까지 이 표를 기계 측정과 같은 신뢰도로 읽지 마라.\n\n` +
    `| # | 메뉴 (표시명) | URL | 근거 | 판정자 · 판정일 | 문서 |\n` +
    `|---|---|---|---|---|---|\n${rows}\n`
  );
};

const unmeasuredBlock = (items: ISurveyItem[]): string => {
  const open = items.filter((i) => i.status === 'unmeasured');
  const rejected = items.filter((i) => i.status === 'rejected');
  if (open.length === 0 && rejected.length === 0) return '';
  const lines: string[] = ['\n## ⚪ 아직 확인되지 않은 것\n'];
  lines.push('아래는 **수집은 됐지만 사람이 확인하지 않은** 항목이다. 지식으로 쓰지 마라.\n');
  if (open.length > 0) {
    lines.push('| 수집된 이름 | URL | 상태 |');
    lines.push('|---|---|---|');
    for (const i of open) {
      lines.push(`| ${i.label} | ${i.url === '' ? '—' : `\`${i.url}\``} | _미확인_ |`);
    }
    lines.push('');
  }
  if (rejected.length > 0) {
    lines.push(`> 사람이 **아니라고 판정**한 항목 ${rejected.length}건은 문서에 넣지 않았다.\n`);
  }
  return lines.join('\n');
};

const featuresMd = (survey: ISurvey, title: string): string => {
  const e = survey.entry;
  const measured = dateOf(survey.collectedAt);
  const val = (v: string): string => (v.trim() === '' ? '_미실측_' : v.trim());

  return `# ${title} · 기능 · 화면 개요

> **실측일: ${measured}** — 이 문서는 그날 제품을 직접 열어 확인한 내용이다.
> **수집 대상: ${e.sourceRef.trim() === '' ? '_미기재_ — 어느 빌드에서 걷었는지 모른다' : e.sourceRef.trim()}**
> 제품이 바뀌면 낡는다. 낡았는지 의심되면 **다시 실측하고 이 날짜를 갱신**한다.
> 생성: qa-harness 지식 실측 콘솔 (자동 수집 + 사람 확인)

**테스트 환경**: ${val(e.baseUrl)}
**로그인 URL**: ${val(e.loginUrl)}
**로그인 후 진입**: ${val(e.landingUrl)}

## 로그인 방식

${val(e.loginMethod)}

${e.note.trim() === '' ? '' : `> ${e.note.trim()}\n`}
## LNB (좌측 사이드바 · 상→하)

각 메뉴는 **폴더**로 구성. 폴더 내부에 \`{메뉴명}_main.md\` (개요 + 서브 인덱스).

${lnbTable(survey.items)}
> **폴더명은 공백·괄호를 뺀 형태**다. TC 대분류도 이 폴더명을 쓴다.
${unmeasuredBlock(survey.items)}`;
};

const lnbDocMd = (item: ISurveyItem, title: string, measured: string): string => {
  const folder = folderName(item.label);
  return `# ${title} · ${item.label}

> **실측일: ${measured}**

- **URL**: ${item.url.trim() === '' ? '_미실측_' : `\`${item.url}\``}
- **폴더(TC 대분류)**: \`${folder}\`

## 화면 개요

${item.detail.trim() === '' ? '_미실측 — 화면 설명을 아직 적지 않았다._' : item.detail.trim()}

## 주요 동작

_미실측_

## 규칙 · 제약

_미실측_
`;
};

const listDoc = (
  title: string,
  measured: string,
  head: string,
  cols: [string, string],
  items: ISurveyItem[],
): string => {
  const kept = items.filter(KEPT);
  const rows =
    kept.length === 0
      ? `|      |      |`
      : kept.map((i) => `| ${i.label} | ${i.detail.replace(/\|/g, '\\|') || '_미실측_'} |`).join('\n');
  return `# ${title} · ${head}

> **실측일: ${measured}**

| ${cols[0]} | ${cols[1]} |
|---|---|
${rows}
${kept.length === 0 ? '\n_미실측 — 확인된 항목이 아직 없습니다._\n' : ''}`;
};

/**
 * 쓸 파일 목록을 만든다. **쓰지는 않는다** — 화면이 먼저 보여주고 사람이 누르면 그때 쓴다.
 */
export const planEmit = (survey: ISurvey, title: string): IEmitFile[] => {
  const base = join('domains', survey.domain, 'knowledge');
  const measured = dateOf(survey.collectedAt);
  const files: IEmitFile[] = [];

  const add = (rel: string, content: string): void => {
    const abs = join(domainsDir(), '..', rel);
    let exists = false;
    let isStub = false;
    try {
      const cur = readFileSync(abs, 'utf8');
      exists = true;
      isStub = /_TBD/.test(cur);
    } catch {
      exists = false;
    }
    files.push({ path: rel, content, exists, isStub });
  };

  add(join(base, 'features.md'), featuresMd(survey, title));

  for (const item of survey.items.filter((i) => i.kind === 'lnb' && KEPT(i))) {
    const folder = folderName(item.label);
    add(join(base, 'features', folder, `${folder}_main.md`), lnbDocMd(item, title, measured));
  }

  const terms = survey.items.filter((i) => i.kind === 'term');
  if (terms.length > 0) {
    add(join(base, 'glossary.md'), listDoc(title, measured, '용어 사전', ['용어', '정의'], terms));
  }
  const issues = survey.items.filter((i) => i.kind === 'issue');
  if (issues.length > 0) {
    add(
      join(base, 'known-issues.md'),
      listDoc(title, measured, '알려진 이슈', ['이슈', '내용 · 워크어라운드'], issues),
    );
  }

  assertNoCredentials(survey, files);
  return files;
};

/**
 * 실제로 쓴다. **골격이 아닌 기존 문서는 덮지 않는다** — 사람이 쌓아 온 지식을
 * 자동 생성이 지우는 사고를 구조로 막는다. 덮으려면 화면에서 명시적으로 고른다.
 */
export const applyEmit = (
  files: IEmitFile[],
  overwrite: string[],
): { written: string[]; skipped: { path: string; why: string }[] } => {
  const written: string[] = [];
  const skipped: { path: string; why: string }[] = [];
  const allow = new Set(overwrite);

  for (const f of files) {
    if (f.exists && !f.isStub && !allow.has(f.path)) {
      skipped.push({ path: f.path, why: '이미 작성된 문서다 (골격이 아님). 덮어쓰기를 명시해야 쓴다.' });
      continue;
    }
    const abs = join(domainsDir(), '..', f.path);
    mkdirSync(dirname(abs), { recursive: true });
    if (existsSync(abs) && !f.isStub && !allow.has(f.path)) {
      skipped.push({ path: f.path, why: '쓰기 직전에 파일이 생겼다. 다시 확인이 필요하다.' });
      continue;
    }
    writeFileSync(abs, f.content, 'utf8');
    written.push(f.path);
  }
  return { written, skipped };
};
