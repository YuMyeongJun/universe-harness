/**
 * 스모크 — 훈련장 없이 도는 부분만 확인한다(빌드·워크트리 없이 수 초).
 *   yarn workspace @core/fe-agent-contracts selftest
 *
 * 여기서 초록불이라고 스테이지가 통과한다는 뜻은 아니다. 이건 **부품 점검**이다.
 * 두 축만 본다: (1) 심어 둔 결함을 다 잡는가 (2) **정상 코드를 오탐하지 않는가.**
 * 두 번째가 더 중요하다 — 관문이 헛돌면 에이전트는 관문을 무시하는 법부터 배운다.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type { IContractLanes } from '@core/fe-agent-harness';

import { parseVerdict, runStaticRules } from './contract.ts';
import { ALL_RULES, COMMON_RULES } from './rules/index.ts';
import { extractWikiCards, firstMissingPath, foldTrajectory } from './wiki/extract.ts';
import type { IWikiCard } from './wiki/extract.ts';

const ALL_LANES: IContractLanes = { quality: true, typeSafety: true, tailwind: true, a11y: true, delivery: true };

const LONG_TOKEN_CLASS = Array.from({ length: 40 }, (_, index) => `tw-token-${index}`).join(' ');

/**
 * ⚠️ **모듈 스코프로 올렸다** — `fixtures/messy-galaxy` 를 이 표에서 **생성**하기 때문이다.
 * 손으로 쓴 픽스처는 규칙이 늘 때 낡는데, 낡은 픽스처는 조용히 커버리지를 줄인다.
 */
export const RULE_MATRIX: Array<{ id: string; path: string; positive: string; negative: string }> = [
  {
    id: 'a11y/semantic-element',
    path: 'src/rulebite/SemanticElement.tsx',
    positive: `export const ClickableRow = () => <div onClick={handleClick}>클릭</div>;\n`,
    negative: `export const ClickableRow = () => (
<div role="button" tabIndex={0} onClick={handleClick} onKeyDown={handleKeyDown}>
  클릭
</div>
);
`,
  },
  {
    id: 'a11y/img-alt',
    path: 'src/rulebite/ImgAlt.tsx',
    positive: `export const Photo = () => <img src="/a.png" />;\n`,
    negative: `export const Photo = () => <img src="/a.png" alt="상품 이미지" />;\n`,
  },
  {
    id: 'a11y/button-type',
    path: 'src/rulebite/ButtonType.tsx',
    positive: `export const Save = () => <button onClick={handleClick}>저장</button>;\n`,
    negative: `export const Save = () => <button type="button" onClick={handleClick}>저장</button>;\n`,
  },
  {
    id: 'a11y/accessible-name',
    path: 'src/rulebite/AccessibleName.tsx',
    positive: `export const A = () => <button type="button"><Icons.IcClose width={12} /></button>;\n`,
    negative: `export const A = () => <button type="button" aria-label="닫기"><Icons.IcClose /></button>;\nexport const B = () => <button type="button"><IcClose />닫기</button>;\n`,
  },
  {
    id: 'a11y/input-label',
    path: 'src/rulebite/InputLabel.tsx',
    positive: `export const F = () => <Input type="text" placeholder="아이디" />;\n`,
    negative: `export const F = () => <Input id="user" placeholder="아이디" />;\nexport const G = () => <Card title="제목" />;\n`,
  },
  {
    id: 'quality/naming-intent',
    path: 'src/rulebite/NamingIntent.ts',
    positive: `export const load = async () => {\n  const responseData = await fetchData();\n  return responseData;\n};\n`,
    negative: `export const load = async () => {\n  const pendingTemplates = await fetchData();\n  const result = await confirm();\n  const value = event.target.value;\n  return { pendingTemplates, result, value };\n};\n`,
  },
  {
    id: 'quality/magic-number',
    path: 'src/rulebite/MagicNumber.ts',
    /* known-negative 가 핵심이다 — 이 규칙은 오탐이 나기 제일 쉽다.
       이름 붙인 상수 · 한 자리 수 · HTTP 상태 코드를 전부 통과시켜야 한다. */
    positive: `export const close = () => {\n  setTimeout(hide, 300);\n};\n`,
    /* ⚠️ 데이터 레코드의 값(`price: 4500`)도 known-negative 다 — 픽스처 은하에 걸어 보고서야
       그 오탐이 보였다. 4500 에 이름을 붙이는 건 우스운 일이고, 토스가 말하는 매직 넘버는
       **로직을 정하는 수**이지 레코드의 값이 아니다. */
    negative: `const HIDE_DELAY_MS = 300;\n/* fp: 레코드 값 */\nconst menu = [{ id: 'a1', title: '아메리카노', price: 4500 }];\nexport const close = (status: number) => {\n  /* fp: HTTP 상태 코드 */\n  if (status === 404) {\n    return;\n  }\n  setTimeout(hide, HIDE_DELAY_MS);\n  void menu;\n};\n/* fp: JSX 치수 prop */\nexport const Box = () => <div width={12} listWidth={150} />;\n/* fp: 숫자 객체 키 */\nconst labels = { 10: { label: '십' }, 4029: { label: '사천' } };\n/* fp: JSX 텍스트 */\nexport const NotFound = () => <>404</>;\nvoid labels;\n`,
  },
  {
    id: 'quality/nested-ternary',
    path: 'src/rulebite/NestedTernary.ts',
    positive: `export const label = (isA: boolean, isB: boolean) => (isA ? (isB ? 'AB' : 'A') : 'other');\n`,
    negative: `/* fp: 널 병합 */\nexport const label = (isA: boolean, v?: string) => (isA ? v ?? 'A' : 'other');\n/* fp: 옵셔널 체이닝 */\nexport const pick = (d?: { isOld: boolean }) => (d?.isOld ? '변경' : '정상');\n`,
  },
  {
    id: 'quality/early-return',
    path: 'src/rulebite/EarlyReturn.ts',
    positive: `export const f = (a: boolean, b: boolean, c: boolean) => {
if (a) {
  if (b) {
    if (c) {
      return 1;
    }
  }
}
return 0;
};
`,
    negative: `export const g = (a: boolean, b: boolean) => {
if (!a) {
  return 0;
}
if (!b) {
  return 0;
}
return 1;
};
`,
  },
  {
    id: 'quality/copy-state',
    path: 'src/rulebite/CopyState.tsx',
    positive: `interface IWizardStepProps {
initialCategory?: string;
}

export const WizardStep = ({ initialCategory }: IWizardStepProps) => {
const [category, setCategory] = useState(initialCategory);
return category;
};
`,
    /* ⚠️ known-negative 셋. 뒤 둘은 **살아 있는 은하에서 실제로 오탐이던 모양**이다(R107) —
       1,407파일 13건 중 8건이 이 둘이었다. 되돌아오면 여기서 잡힌다. */
    negative: `interface IResetterProps {
isOpen: boolean;
defaultLabel?: string;
}

export const Resetter = ({ isOpen, defaultLabel }: IResetterProps) => {
const [files, setFiles] = useState<string[]>([]);
const [label, setLabel] = useState(defaultLabel);
const { setLocalStorage } = useStorageUtils();
useEffect(() => {
  setFiles([]);
}, [isOpen]);
useEffect(() => {
  setLocalStorage('lnb-open', isOpen ? 'open' : 'close');
}, [isOpen]);
return files.length + label;
};
`,
  },
  {
    id: 'quality/cohesion',
    path: 'src/rulebite/Cohesion.tsx',
    positive: `interface IPanelProps {\n  isOpen: boolean;\n  hasError: boolean;\n  canEdit: boolean;\n}\n`,
    negative: `interface IPanelProps {\n  isOpen: boolean;\n  hasError: boolean;\n  title: string;\n}\nexport const A = () => <Modal useDim useEscButton shouldCloseOnEsc />;\n`,
  },
  {
    id: 'repo/no-class',
    path: 'src/rulebite/NoClass.ts',
    positive: `export class Widget {
render() {
  return null;
}
}
`,
    negative: `export const createWidget = () => ({ render: () => null });\n`,
  },
  {
    id: 'repo/no-enum',
    path: 'src/rulebite/NoEnum.ts',
    positive: `export enum Status {
Active,
Inactive,
}
`,
    negative: `export const Status = { Active: 'active', Inactive: 'inactive' } as const;\n`,
  },
  {
    id: 'repo/arrow-only',
    path: 'src/rulebite/ArrowOnly.ts',
    positive: `export function sum(a: number, b: number) {
return a + b;
}
`,
    negative: `export const sum = (a: number, b: number) => a + b;\n`,
  },
  {
    id: 'repo/interface-prefix',
    path: 'src/rulebite/InterfacePrefix.ts',
    positive: `interface UserProps {
name: string;
}
`,
    negative: `interface IUserProps {
name: string;
}
`,
  },
  {
    id: 'repo/braces-required',
    path: 'src/rulebite/BracesRequired.ts',
    positive: `export const check = (isValid: boolean) => {
if (isValid) doSomething();
return isValid;
};
`,
    negative: `export const check = (isValid: boolean) => {
if (isValid) {
  doSomething();
}
return isValid;
};
`,
  },
  {
    id: 'ts/no-any',
    path: 'src/rulebite/NoAny.ts',
    positive: `export const parse = (raw: any) => raw;\n`,
    negative: `export const parse = (raw: unknown) => raw;\n`,
  },
  {
    id: 'tailwind/arbitrary-value',
    path: 'src/rulebite/ArbitraryValue.tsx',
    /* ⚠️ `border-[color:#333]` 은 **타입 힌트가 붙었지만 하드코딩**이다 — 걸려야 맞다.
       힌트가 있다고 빼면 안 된다는 것을 여기서 못 박는다(아래 negative 와 짝이다). */
    positive: `export const Box = () => <div className="min-w-[70px] leading-[14px] border-[color:#333]" />;\n`,
    /* ⚠️ **같은 오탐이 새 문법으로 돌아왔다.** `var(--x)` 만 빼 뒀는데 남의 저장소에
       Tailwind 4 의 축약형 `bg-[--color-bg]` 가 23건 있었다. `calc()` 도 토큰으로
       표현할 수 없어 뺀다 — 처방이 없는 규칙은 「어쩌라고」가 된다. */
    /* ⚠️⚠️ **세 번째로 같은 오탐이 샜다 — 이번엔 「타입 힌트」다.**
       옆 저장소(whitehole-front) 세션이 잡아 줬다: `text-[color:var(--ui-label-tertiary)]` 가
       **위반으로 나왔는데 그건 규칙을 지킨 쪽이다.** 값이 디자인 토큰이고 실재도 확인됐다.
       ⛔ **자기 처방을 이미 따른 코드를 위반으로 냈다** — 그런 규칙은 사람이 도구를 안 믿게 한다.
       원인: 가드가 `[` **바로 뒤**만 봤는데 Tailwind 는 `text-[color:…]`·`bg-[length:…]` 처럼
       **타입 힌트**를 허용한다. 힌트가 끼면 `var(--` 가 뒤로 밀려 안 걸렸다.
       ⇒ 실측: 진짜 은하에서 **699 → 692**(오탐 7건). 표본에서 본 4건보다 많았다.
       ⚠️ 오탐이 이번이 **세 번째**다(① `var()` ② Tailwind 4 축약형 ③ 타입 힌트) —
          **문법이 늘 때마다 샌다.** 그래서 접두사가 아니라 **값의 모양**으로 판정한다. */
    negative: `export const A = () => <div className="bg-[var(--ui-primary)] w-[--sidebar-width] h-[calc(100vh-20rem)] text-[color:var(--ui-label)] bg-[length:var(--s)] bg-background" />;\n`,
  },
  {
    id: 'tailwind/theme-hardcoded',
    path: 'src/rulebite/ThemeHardcoded.tsx',
    positive: `export const Note = () => <div className="text-primary" data-note="#3B82F6 fallback" />;\n`,
    negative: `export const Note = () => <div className="bg-primary" />;\n`,
  },
  {
    id: 'tailwind/class-legibility',
    path: 'src/rulebite/ClassLegibility.tsx',
    positive: `export const Box = () => <div className="${LONG_TOKEN_CLASS}" />;\n`,
    negative: `export const Box = () => <div className="flex items-center gap-2" />;\n`,
  },
  /* ─────────────────────────────────────────────────────────────────────────
   * **확장자 자체를 재는 칸** — 규칙이 아니라 `applies` 를 겨눈다.
   *
   * ⚠️⚠️ 왜 필요한가: 규칙 20개는 전부 정규식이라 TS 문법에 매인 것이 없는데도
   * `.js`·`.jsx` 를 **한 줄(`isSource`/`isTsx`) 때문에** 안 읽고 있었다. 그 한 줄이
   * 되돌아가도 **위 20칸은 전부 `.ts`/`.tsx` 라 하나도 안 문다** — 조용히 닫힌다.
   * ⇒ 아래 두 칸은 **확장자만 다른 중복**이다. 일부러 중복이다. 이것이 물지 않으면
   *   「JS 를 연다」가 거짓이 된 것이고, 매 관문에서 그것이 재진다.
   *   그리고 `fixtures/messy-galaxy` 가 이 표에서 **생성**되므로, 더러운 은하에도
   *   `.js`/`.jsx` 파일이 생겨 **파이프라인 층(훑개→확장자 거르기→스캔)까지** 재진다.
   *
   * ⛔ `.vue`·`.svelte`·`.astro` 칸은 **없다.** 안 열었기 때문이다 — 이유는
   *   `rules/helpers.ts` 와 `lib/blind.mjs` 에 적었다(템플릿 문법을 못 읽는다).
   * ───────────────────────────────────────────────────────────────────────── */
  {
    id: 'quality/naming-intent',
    path: 'src/rulebite/NamingIntentJs.js',
    positive: `export const load = async () => {\n  const responseData = await fetchData();\n  return responseData;\n};\n`,
    negative: `export const load = async () => {\n  const pendingTemplates = await fetchData();\n  return pendingTemplates;\n};\n`,
  },
  {
    id: 'a11y/button-type',
    path: 'src/rulebite/ButtonTypeJsx.jsx',
    positive: `export const Save = () => <button onClick={handleClick}>저장</button>;\n`,
    negative: `export const Save = () => <button type="button" onClick={handleClick}>저장</button>;\n`,
  },
];

const BAD = `import { useEffect, useState } from 'react';

interface RowProps {
  data: { id: string };
  onPick: (id: string) => void;
}

export function Row(props: RowProps) {
  const [data2, setData2] = useState(props.data.id);
  useEffect(() => { setData2(props.data.id); }, [props.data.id]);
  return <div onClick={() => props.onPick(data2)} className="w-[327px] bg-[#FFFFFF]"><img src="/a.png" /></div>;
}
`;

const GOOD = `interface IRowProps {
  itemId: string;
  onPick: (itemId: string) => void;
}

export const Row = ({ itemId, onPick }: IRowProps) => (
  <button type="button" onClick={() => onPick(itemId)} className="w-full bg-background">
    <img src="/a.png" alt="상품 이미지" />
  </button>
);
`;

/* ─────────────────────────────────────────────────────────────────────────
 * WikiSkill 추출 — 궤적 없이 도는 회귀.
 *
 * 실제 SOLVED 궤적이 하나도 없어서 **수율을 한 번도 재지 못했다.** 합성 궤적(아래 JSONL)과
 * 고정 응답을 넣어 전 경로를 돌린다: foldTrajectory → 프롬프트 조립 → 카드 파싱 → 두 필터 →
 * 파일 쓰기 → index 갱신. LLM 은 부르지 않는다(`callModel` 주입).
 *
 * ⚠️ 양방향으로 본다. 좋은 카드가 살아남는 것만 보면 필터가 통째로 죽어도 초록불이 뜬다 —
 *    그래서 **버려져야 할 카드가 버려지는지**를 같은 무게로 단언한다.
 * ───────────────────────────────────────────────────────────────────────── */

/** 합성 궤적 한 줄 = 한 사건. `EnvHarness.record()` → `trajectoryRecorder.append()` 스키마 그대로. */
const entry = (fields: Record<string, unknown>) =>
  JSON.stringify({ runId: 'selftest-run', stageId: 's01-bundle', ...fields });

const SOLVED_TRAJECTORY = [
  entry({ kind: 'reset', step: 0, bootBuildExit: 0, sandbox: '/tmp/sandbox/selftest-run' }),
  entry({ kind: 'log', step: 1, message: '이 줄은 접힌 텍스트에 들어가면 안 된다' }),
  entry({ kind: 'probe', step: 1, command: 'node -e "process.stdout.write(String(1))"', exit: 0 }),
  entry({ kind: 'shell', step: 2, command: 'grep -c echarts dist/index.html', exit: 1 }),
  entry({
    kind: 'contract',
    step: 3,
    decision: 'REJECTED',
    files: ['src/pages/A.tsx'],
    note: '복사본 state 부터',
    verdict: {
      reasons: [{ rule: 'quality/copy-state' }, { rule: 'tailwind/arbitrary-value' }, { rule: 'quality/copy-state' }],
    },
  }),
  entry({ kind: 'contract', step: 4, decision: 'ALLOWED', files: ['src/pages/A.tsx'], note: '수정본' }),
  entry({ kind: 'patch', step: 5, files: ['src/pages/A.tsx'] }),
  entry({
    kind: 'submit',
    step: 6,
    decision: 'SOLVED',
    reward: 0.783,
    rejects: 1,
    gates: [
      { name: 'build', ok: true, measured: 'exit 0 · 12.4s' },
      { name: 'lint', ok: true, measured: '0 error 3 warning' },
    ],
    checks: [{ name: 'echarts-not-in-entry', ok: true, measured: '정적 스크립트 3개' }],
    diff: 'diff --git a/vite.config.ts b/vite.config.ts\n',
  }),
].join('\n');

const FAILED_TRAJECTORY = [
  entry({ kind: 'reset', step: 0, bootBuildExit: 0 }),
  entry({ kind: 'submit', step: 2, decision: 'FAILED', reward: 0.42, rejects: 0, gates: [], checks: [], diff: '' }),
].join('\n');

const card = (fields: Partial<IWikiCard>): IWikiCard => ({
  id: 'x',
  title: '제목',
  scope: ['vite'],
  rule: '규칙',
  why: 'step 2 관측',
  verify: 'ls dist/index.html',
  counterexample: '',
  confidence: 'high',
  supersedes: '',
  ...fields,
});

/** 고정 응답 8장 — 살아야 할 4장 · 죽어야 할 4장. */
const FIXED_CARDS: IWikiCard[] = [
  card({ id: 'entry-chunk-echarts', verify: 'grep -c echarts dist/index.html' }),
  /* 죽어야 함 ① 재는 법이 없다 */
  card({ id: 'no-verify-empty', verify: '' }),
  /* 죽어야 함 ② 재는 법이 공백뿐이다 */
  card({ id: 'no-verify-blank', verify: '   \n\t ' }),
  /* 죽어야 함 ③ 추출기가 재구성한 경로 — 실측으로 드러난 실패 모드 */
  card({ id: 'ghost-path-rebuilt', verify: 'cat apps/partners/dist/index.html' }),
  /* 살아야 함 — 가운데 글롭이 낀 verify. 옛 검사는 `path.dirname` 으로 한 칸만 떼어 죽였다. */
  card({ id: 'glob-verify', verify: 'eslint "src/**/*.tsx" --format json -o /tmp/lint.json' }),
  /* 살아야 함 — URL. 옛 검사는 도메인을 저장소 경로로 읽고 죽였다. */
  card({ id: 'url-verify', verify: 'curl -sI https://example.com/deep/link | head -1' }),
  card({ id: 'entry-chunk-echarts-v2', supersedes: 'entry-chunk-echarts' }),
  /* 죽어야 함 ④ id 가 지식창고 밖을 가리킨다(그대로 두면 파일을 밖에 쓰고 밖의 파일을 지운다) */
  card({ id: '../../escaped', supersedes: '../../pkg' }),
];

const withCapturedLogs = async <T>(run: () => Promise<T>): Promise<{ result: T; logs: string[] }> => {
  const logs: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => {
    logs.push(args.map((arg) => String(arg)).join(' '));
  };
  try {
    return { result: await run(), logs };
  } finally {
    console.log = original;
  }
};

const makeFixtureRepo = async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'wiki-selftest-'));
  await fs.mkdir(path.join(root, 'src', 'pages'), { recursive: true });
  await fs.mkdir(path.join(root, 'dist'), { recursive: true });
  await fs.mkdir(path.join(root, 'apps'), { recursive: true });
  await fs.mkdir(path.join(root, 'trajectories'), { recursive: true });
  await fs.writeFile(path.join(root, 'dist', 'index.html'), '<html></html>');
  await fs.writeFile(path.join(root, 'src', 'pages', 'A.tsx'), 'export const A = () => null;\n');
  await fs.writeFile(path.join(root, 'CLAUDE.md'), '# 하우스룰\n');
  await fs.writeFile(path.join(root, 'trajectories', 'solved.jsonl'), `${SOLVED_TRAJECTORY}\n`);
  await fs.writeFile(path.join(root, 'trajectories', 'failed.jsonl'), `${FAILED_TRAJECTORY}\n`);
  return root;
};

const wikiExtractionSelftest = async () => {
  /* 11. 궤적 접기 — 원문이 아니라 **판단에 쓰는 것만** 남는가. */
  const foldedEntries = SOLVED_TRAJECTORY.split('\n').map((line) => JSON.parse(line) as unknown) as Parameters<
    typeof foldTrajectory
  >[0];
  const folded = foldTrajectory(foldedEntries);
  assert.equal(folded.outcome, 'SOLVED');
  assert.equal(folded.reward, 0.783);
  assert.equal(folded.rejects, 1);
  assert.equal(folded.steps, 6);
  assert.equal(folded.stageId, 's01-bundle');
  assert.ok(!folded.text.includes('들어가면 안 된다'), 'log 줄이 접힌 텍스트에 섞였다');
  assert.ok(folded.text.includes('probe(exit 1): grep -c echarts'), 'probe 명령이 접힌 텍스트에서 사라졌다');
  assert.ok(
    folded.text.includes('[quality/copy-state, tailwind/arbitrary-value]'),
    `Contract 반려 사유가 중복 제거되어 남지 않았다: ${folded.text}`,
  );
  assert.ok(folded.text.includes('PASS echarts-not-in-entry'), '체크 결과가 접힌 텍스트에서 사라졌다');
  console.log('✅ 궤적 접기: log 는 빠지고 probe·반려 사유·게이트 결과는 남는다');

  /* 12. 수율 — 고정 응답 8장을 넣으면 몇 장이 남는가. 실제 LLM 은 부르지 않는다. */
  const root = await makeFixtureRepo();
  /* 지식창고를 한 칸 깊이 둔다 — `../../escaped` 가 튀는 자리(`<root>/escaped.md`)까지
     이 임시 저장소 안에 가둬야 시험이 os 임시 폴더를 더럽히지 않는다. 실제로 더럽혔다:
     필터를 뗀 변이 시험이 `os.tmpdir()/escaped.md` 를 남겼고, 다음 대조군이 그 잔재로 실패했다. */
  const knowledgeDir = path.join(root, 'nest', 'knowledge');
  const indexPath = path.join(root, 'SKILL.md');
  let calls = 0;
  const { result: accepted, logs } = await withCapturedLogs(() =>
    extractWikiCards(['trajectories/solved.jsonl', 'trajectories/failed.jsonl'], {
      repoRoot: root,
      knowledgeDir,
      indexPath,
      houseRulesPath: path.join(root, 'CLAUDE.md'),
      today: '2026-09-04',
      callModel: async (call) => {
        calls += 1;
        assert.ok(call.input.includes('[STAGE] s01-bundle'), '프롬프트에 스테이지가 안 실렸다');
        assert.ok(call.input.includes('[HOUSE_RULES]'), '프롬프트에 하우스룰 절이 안 실렸다');
        return { text: `설명입니다.\n${JSON.stringify(FIXED_CARDS)}\n끝.`, sessionId: null, isError: false };
      },
    }),
  );
  const dropped = (needle: string) => logs.filter((log) => log.startsWith('버림') && log.includes(needle)).length;

  assert.equal(calls, 1, `SOLVED 궤적 1개에만 모델을 불러야 하는데 ${calls}번 불렀다 — FAILED 궤적이 샜다`);
  assert.equal(accepted.length, 4, `수율이 바뀌었다(8장 → ${accepted.length}장): ${JSON.stringify(logs, null, 2)}`);
  assert.equal(dropped('재는 법 없음'), 2, `「재는 법 없음」 2장이어야 한다: ${JSON.stringify(logs)}`);
  assert.equal(dropped('없는 경로'), 1, `「없는 경로」 1장이어야 한다: ${JSON.stringify(logs)}`);
  assert.equal(dropped('id 형태 위반'), 1, `「id 형태 위반」 1장이어야 한다: ${JSON.stringify(logs)}`);
  console.log(`✅ 수율: 카드 8장 → ${accepted.length}장 (재는 법 없음 2 · 없는 경로 1 · id 형태 위반 1)`);

  /* 13. 음성 시험 — **버려져야 할 카드가 살아남으면 필터는 장식이다.** */
  const acceptedIds = new Set(accepted.map((accept) => accept.id));
  for (const deadId of ['no-verify-empty', 'no-verify-blank', 'ghost-path-rebuilt', '../../escaped']) {
    assert.ok(!acceptedIds.has(deadId), `버려져야 할 카드가 살아남았다 — 필터가 안 문다: ${deadId}`);
    assert.ok(
      !(await fs
        .stat(path.join(knowledgeDir, `${deadId}.md`))
        .then(() => true)
        .catch(() => false)),
      `버린 카드의 파일이 남았다(밖으로 튄 id 는 지식창고 **밖**에 남는다): ${deadId}`,
    );
  }
  console.log('✅ 음성 시험: 재는 법 없는 카드 · 없는 경로 카드 · 밖으로 튀는 id 는 파일도 안 남긴다');

  /* 14. 그 대신 **좋은 카드는 살아남고** 파일·index 까지 간다(오탐을 줄이다 통로를 막지 않았는가). */
  for (const liveId of ['entry-chunk-echarts', 'glob-verify', 'url-verify', 'entry-chunk-echarts-v2']) {
    assert.ok(acceptedIds.has(liveId), `살아야 할 카드를 버렸다: ${liveId}`);
  }
  const files = (await fs.readdir(knowledgeDir)).sort();
  assert.deepEqual(
    files,
    ['entry-chunk-echarts-v2.md', 'glob-verify.md', 'url-verify.md'],
    `supersedes 가 옛 카드 파일을 안 지웠거나 파일이 안 써졌다: ${files.join(', ')}`,
  );
  const index = await fs.readFile(indexPath, 'utf8');
  for (const name of files) {
    assert.ok(index.includes(`knowledge/${name}`), `index 에 ${name} 이 안 실렸다`);
  }
  console.log('✅ 좋은 카드는 파일이 되고 supersedes 는 옛 파일을 지우고 index 가 다시 써진다');

  /* 15. 경로 검사 오탐 회귀 — 셋 다 **저장소에 있는 것**을 가리키는데 옛 검사는 버렸다.
         (가운데 글롭 · URL 도메인 · 절대 경로. 옛 검사에서 8장 중 2장이 이 이유로 죽었다.) */
  for (const [verify, why] of [
    ['grep -rn useState src/pages/A.tsx', '평범한 상대 경로'],
    ['eslint "src/**/*.tsx" --format json', '가운데 글롭 — 글롭 앞까지만 본다'],
    ['ls src/pages/*.tsx', '끝 세그먼트 글롭'],
    ['curl -sI https://example.com/deep/link', 'URL 은 저장소 경로가 아니다'],
    ['eslint ./src --format json -o /tmp/lint.json', '절대 경로는 저장소 밖이다'],
    ['cat ../outside/file.txt', '상위로 튀는 경로도 저장소 밖이다'],
  ]) {
    assert.equal(await firstMissingPath(verify, root), null, `멀쩡한 verify 를 「없는 경로」로 버린다(${why}): ${verify}`);
  }
  console.log('✅ 경로 검사 오탐 회귀: 가운데 글롭 · URL · 절대 경로를 「없는 경로」로 안 읽는다');

  /* 15-1. 그런데 **진짜 없는 경로**는 계속 잡아야 한다(오탐을 줄이다 탐지를 죽이지 않았는가). */
  assert.equal(
    await firstMissingPath('cat apps/partners/dist/index.html', root),
    'apps/partners/dist/index.html',
    '추출기가 재구성한 경로를 놓쳤다 — 실측으로 드러난 바로 그 실패 모드다',
  );
  assert.equal(await firstMissingPath('ls nope/here.txt', root), 'nope/here.txt', '없는 경로를 놓쳤다');
  console.log('✅ 경로 검사: 재구성된 경로(apps/partners/dist/…)는 계속 버린다');

  /* 16. 카드를 못 읽는 응답에도 **안 터진다** — 0장은 정당한 결과다.
         옛 코드는 `JSON.parse('')` 로 SyntaxError 를 던져 나머지 궤적까지 통째로 날렸다
         (실측: 「만들 카드가 없습니다」 한 줄에 추출기 전체가 죽었다).
         두 갈래를 다 본다 — 대괄호가 아예 없는 응답 · 대괄호는 있는데 JSON 이 아닌 응답. */
  const chatty = await makeFixtureRepo();
  for (const [text, why] of [
    ['만들 카드가 없습니다. 관측 근거가 부족합니다.', '대괄호가 아예 없다'],
    ['[STAGE] 를 보니 [이 궤적] 에서 뽑을 것이 없습니다.', '대괄호는 있는데 JSON 이 아니다'],
    ['{"id":"x"}', '배열이 아니라 객체다'],
  ]) {
    const { result: none } = await withCapturedLogs(() =>
      extractWikiCards(['trajectories/solved.jsonl'], {
        repoRoot: chatty,
        knowledgeDir: path.join(chatty, 'knowledge'),
        indexPath: path.join(chatty, 'SKILL.md'),
        today: '2026-09-04',
        callModel: async () => ({ text, sessionId: null, isError: false }),
      }),
    );
    assert.deepEqual(none, [], `카드를 못 읽는 응답에서 카드가 나왔다(${why})`);
  }
  console.log('✅ 카드를 못 읽는 응답 3종 → 0장 (터지지 않는다)');

  await Promise.all([fs.rm(root, { recursive: true, force: true }), fs.rm(chatty, { recursive: true, force: true })]);
};

const main = async () => {
  /* 1. 정적 레인이 심어 둔 결함을 전부 잡는가 */
  const reasons = runStaticRules([{ path: 'src/Row.tsx', content: BAD }], ALL_RULES, ALL_LANES);
  const rules = new Set(reasons.map((reason) => reason.rule));
  for (const expected of [
    'repo/arrow-only',
    'repo/interface-prefix',
    'quality/naming-intent',
    'quality/copy-state',
    'tailwind/arbitrary-value',
    'a11y/semantic-element',
    'a11y/img-alt',
  ]) {
    assert.ok(rules.has(expected), `놓친 규칙: ${expected}`);
  }
  console.log(`✅ 정적 레인 ${reasons.length}건 검출 · 기대 규칙 ${rules.size}종`);

  /* 2. 통과해야 할 코드는 통과하는가 */
  const clean = runStaticRules([{ path: 'src/Row.tsx', content: GOOD }], ALL_RULES, ALL_LANES);
  assert.deepEqual(clean, [], `오탐: ${JSON.stringify(clean, null, 2)}`);
  console.log('✅ 정상 코드 오탐 0');

  /* 3. 레인을 끄면 그 레인 규칙은 아예 안 돈다(스테이지가 축을 좁힐 수 있어야 한다) */
  const qualityOnly = runStaticRules([{ path: 'src/Row.tsx', content: BAD }], ALL_RULES, {
    ...ALL_LANES,
    a11y: false,
    tailwind: false,
  });
  assert.ok(!qualityOnly.some((reason) => reason.rule.startsWith('a11y/')), 'a11y 레인을 껐는데 a11y 사유가 나왔다');
  assert.ok(!qualityOnly.some((reason) => reason.rule.startsWith('tailwind/')), 'tailwind 레인을 껐는데 사유가 나왔다');
  console.log('✅ 레인 스위치');

  /* 4. 판정 레인 출력 파서 */
  const verdict = parseVerdict(`[STATUS] REJECTED
[VIOLATIONS]
- rule: quality/copy-state
  where: src/Row.tsx:3
  evidence: const [data2, setData2] = useState(props.data.id)
  why: props 를 state 로 복사해 갱신이 한 프레임 늦는다
  fix: 파생값을 렌더 중 계산하라
[NEXT] 복사 state 부터 지워라`);
  assert.equal(verdict.status, 'REJECTED');
  assert.equal(verdict.reasons.length, 1);
  assert.equal(verdict.reasons[0].where, 'src/Row.tsx:3');
  console.log('✅ 판정 레인 파서');

  /* 5. 문법을 어긴 판정은 **막지 않는다** — 관문 오류로 훈련을 죽이지 않는다 */
  const broken = parseVerdict('음... 이 코드는 좋아 보입니다!');
  assert.equal(broken.status, 'ALLOWED');
  console.log('✅ 판정 문법 위반 시 통과 처리');

  /* 6. 기본 묶음은 **팀 합의가 필요한 규칙을 포함하지 않는다** — 남의 저장소에 그대로 얹히려면 */
  const houseOnly = runStaticRules([{ path: 'src/Row.tsx', content: BAD }], COMMON_RULES, ALL_LANES);
  assert.ok(!houseOnly.some((reason) => reason.rule.startsWith('repo/')), '기본 묶음에 house-style 이 섞였다');
  console.log('✅ 기본 묶음은 house-style 을 안 켠다');

  /* 7. 실제 코드베이스(파일 1227개)에 걸어 보고 드러난 **오탐 3종** — 회귀로 박는다.
        고치기 전 수치: naming-intent 167건 · copy-state 37건.
        고친 뒤:        naming-intent  85건 · copy-state 19건. 줄어든 100건이 전부 오탐이었다. */
  const FALSE_POSITIVES = `import { useEffect, useState } from 'react';

const lunaPayTypes = { card: 'card' } as const;

export const Sample = () => {
  const templateImageRatioLabel = '4:3';
  const [remainingSeconds, setRemainingSeconds] = useState(180);
  const [payType, setPayType] = useState(lunaPayTypes.card);
  return <div className="bg-[var(--ui-primary-light)] w-[var(--content-control-width)]" />;
};
`;
  const noise = runStaticRules([{ path: 'src/Sample.tsx', content: FALSE_POSITIVES }], ALL_RULES, ALL_LANES);
  assert.ok(
    !noise.some((reason) => reason.rule === 'quality/naming-intent'),
    `\`temp\\w*\` 가 template* 를 다시 먹는다: ${JSON.stringify(noise)}`,
  );
  assert.ok(
    !noise.some((reason) => reason.rule === 'quality/copy-state'),
    `기본값 초기화를 복사본 state 로 오인한다: ${JSON.stringify(noise)}`,
  );
  assert.ok(
    !noise.some((reason) => reason.rule === 'tailwind/arbitrary-value'),
    `토큰을 쓰고 있는 \`var(--…)\` 를 임의 값으로 막는다: ${JSON.stringify(noise)}`,
  );
  console.log('✅ 실측에서 드러난 오탐 4종 회귀 (template* · 리터럴 기본값 · import 줄바꿈 · var(--) 토큰)');

  /* ── R41 회귀: 남의 저장소 표본에서 드러난 오탐 3종.
     ⚠️ 셋 다 **작은 표본에서는 안 나왔다** — 규칙을 만들 때 우리 코드에는 이런 모양이 없었다. */
  const R41_NEGATIVES: Array<{ id: string; path: string; code: string; why: string }> = [
    {
      id: 'quality/nested-ternary',
      path: 'src/Regex.ts',
      code: `export const mask = (v: string) => v.replace(/(?<![0-9xX*])(?:\\d)/g, '*');\n`,
      why: '정규식 리터럴 안의 `?` 는 삼항이 아니다',
    },
    {
      id: 'quality/nested-ternary',
      path: 'src/Query.ts',
      code: `export const link = (id: string) => (id ? \`?templateId=\${id}\` : '/');\n`,
      why: '문자열 안의 `?` 는 삼항이 아니다 — 이건 한 겹이다',
    },
    {
      id: 'a11y/input-label',
      path: 'src/Provider.tsx',
      code: `export const P = () => <Wrapper placeHolder={placeholders}>{null}</Wrapper>;\n`,
      why: 'prop 값 안의 식별자가 `placeholder` 를 품었을 뿐 입력이 아니다',
    },
    {
      id: 'a11y/input-label',
      path: 'src/Field.tsx',
      code: `export const F = () => <TextField placeholder="이름" label="이름" />;\n`,
      why: '`label` prop 으로 이름을 줬다 — 벌하면 고칠 수 없는 자리를 벌하는 것이다',
    },
  ];
  for (const negative of R41_NEGATIVES) {
    const hits = runStaticRules([{ path: negative.path, content: negative.code }], ALL_RULES, ALL_LANES)
      .filter((reason) => reason.rule === negative.id);
    assert.equal(hits.length, 0, `${negative.id} 오탐 회귀 — ${negative.why}`);
  }
  console.log(`✅ R41 오탐 회귀 ${R41_NEGATIVES.length}건 (정규식·문자열 속 ? · placeholder 를 품은 식별자 · label prop)`);

  /* ── R42 회귀: `item` 은 그릇 낱말이 아니라 **도메인 명사**일 수 있다.
     실측 162건 중 11건이 이 모양이었다. 홀로 쓰인 `items` 는 여전히 잡아야 한다. */
  const ITEM_NEGATIVES = [
    `const itemContext = useFileUploadItemContext(NAME);\n`,
    `const itemConfig = getPayloadConfig(config, item, key);\n`,
    `const itemList = useMemo(() => build(cards), [cards]);\n`,
  ];
  for (const code of ITEM_NEGATIVES) {
    const hits = runStaticRules([{ path: 'src/a.ts', content: code }], ALL_RULES, ALL_LANES)
      .filter((reason) => reason.rule === 'quality/naming-intent');
    assert.equal(hits.length, 0, `item 이 도메인 명사인 합성어를 잡으면 안 된다 — ${code.trim()}`);
  }
  for (const code of [`const items = await load();\n`, `const item = rows[0];\n`]) {
    const hits = runStaticRules([{ path: 'src/a.ts', content: code }], ALL_RULES, ALL_LANES)
      .filter((reason) => reason.rule === 'quality/naming-intent');
    assert.equal(hits.length, 1, `홀로 쓰인 item/items 는 계속 잡아야 한다 — ${code.trim()}`);
  }
  console.log('✅ R42 회귀: `item` 합성어 3종은 안 잡고, 홀로 쓰인 `item`/`items` 는 계속 잡는다');

  /* 진짜 하드코딩은 계속 잡아야 한다. */
  const HARDCODED = `export const Box = () => <div className="h-[54px] bg-[#FFFFFF]" />;\n`;
  const caughtStyle = runStaticRules([{ path: 'src/Box.tsx', content: HARDCODED }], ALL_RULES, ALL_LANES);
  assert.ok(
    caughtStyle.some((reason) => reason.rule === 'tailwind/arbitrary-value'),
    '하드코딩된 임의 값을 놓쳤다 — 오탐을 줄이다 탐지를 죽였다.',
  );
  console.log('✅ 하드코딩 임의 값은 계속 잡는다');

  /* 8. 그런데 **진짜** 복사본 state 는 여전히 잡아야 한다(오탐을 줄이다 탐지를 죽이지 않았는가). */
  const REAL_COPY = `interface IWizardProps {
  initialCategory?: string;
}

export const Wizard = ({ initialCategory }: IWizardProps) => {
  const [category, setCategory] = useState(initialCategory);
  return category;
};
`;
  const caught = runStaticRules([{ path: 'src/Wizard.tsx', content: REAL_COPY }], ALL_RULES, ALL_LANES);
  assert.ok(
    caught.some((reason) => reason.rule === 'quality/copy-state'),
    'prop 을 초기값으로 복사한 것을 놓쳤다 — 오탐을 줄이다 탐지를 죽였다.',
  );
  console.log('✅ 진짜 복사본 state 는 계속 잡는다');


  /* 9. `quality/cohesion` — **재는 자리를 옮긴 뒤**의 양방향 회귀.
        ⚠️ 내력을 남긴다. 옛 규칙은 **쓰는 쪽(JSX)** 을 훑었고, 그것도 두 번 고쳤다 —
        처음엔 `is[A-Z]…={true}` 셋이 딱 붙어야만 잡아 실측 은하에서 **0건**이었고,
        훑개로 바꿔 21건(오탐 0)이 됐다.
        그런데 남의 저장소에 걸어 보니 잡히는 것 상당수가
        `<Modal useDim useEscButton …>` — **공유 컴포넌트의 API** 였다.
        **위반은 쓰는 쪽에 뜨는데 고칠 자리는 만든 쪽**이다. 그래서 정의 쪽으로 옮겼다.
        공들인 훑개를 버리는 것이 아깝지만, **엉뚱한 사람을 벌하는 정확한 훑개보다
        옳은 사람을 벌하는 훑개가 낫다.** */
  const COHESION_BAD = `interface IModalShellProps {
  /* 주석 안의 짝 없는 중괄호 { 와 따옴표 ' 가 훑개를 깨면 안 된다 — 실측 파일에 있던 형태다. */
  open: boolean;
  title: string;
  shouldCloseOnEsc?: boolean;
  fitContent?: boolean;
}
`;
  const COHESION_GOOD = `interface IPanelProps {
  isOpen: boolean;
  hasError: boolean;
  title: string;
}
interface IFlags {
  a: boolean;
  b: boolean;
  c: boolean;
}
export const Uses = () => <Modal useDim useEscButton shouldCloseOnEsc />;
`;
  const cohesion = runStaticRules([{ path: 'src/Screen.tsx', content: COHESION_BAD }], ALL_RULES, ALL_LANES);
  assert.ok(
    cohesion.some((reason) => reason.rule === 'quality/cohesion'),
    `선택적·비인접 boolean 3개를 놓쳤다: ${JSON.stringify(cohesion)}`,
  );
  const cohesionClean = runStaticRules([{ path: 'src/Clean.tsx', content: COHESION_GOOD }], ALL_RULES, ALL_LANES);
  assert.ok(
    !cohesionClean.some((reason) => reason.rule === 'quality/cohesion'),
    `boolean 2개 · Props 아닌 인터페이스 · **쓰는 쪽**을 응집 위반으로 잡는다: ${JSON.stringify(cohesionClean)}`,
  );
  console.log('✅ 응집: 제네릭 인자 목록 · boolean 2개 이하는 안 잡는다');

  /* 10. `quality/copy-state` — 실측 19건을 눈으로 세니 **12건이 오탐**이었다(63%).
         전부 한 종류였다: `useEffect(() => setX(<리터럴>))` — 복사가 아니라 **리셋·마운트 통지**다.
         (`setValue('categoryCode', ' ')` 는 react-hook-form 이라 React state 도 아니다.)
         고친 뒤 19건 → 6건. */
  const RESETS = `export const Resetter = ({ isOpen }: IResetterProps) => {
  const [files, setFiles] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setFiles([]); }, [isOpen]);
  useEffect(() => { setMounted(true); }, [isOpen]);
  useEffect(() => { setPhoneNumber(''); }, [isOpen]);
  useEffect(() => { setTemplate(undefined); }, [isOpen]);
  useEffect(() => { setValue('categoryCode', ' '); }, [isOpen]);
  return mounted ? files.length : 0;
};
`;
  const resets = runStaticRules([{ path: 'src/Resetter.tsx', content: RESETS }], ALL_RULES, ALL_LANES);
  assert.ok(
    !resets.some((reason) => reason.rule === 'quality/copy-state'),
    `리터럴 리셋을 복사본 state 로 오인한다: ${JSON.stringify(resets)}`,
  );
  console.log('✅ 복사본 state: 리터럴 리셋(`setFiles([])`·`setValue(\'k\', \' \')`)은 안 잡는다');

  /* 10-1. 그런데 **식별자를 넣는 동기화**는 계속 잡아야 한다(오탐을 줄이다 탐지를 죽이지 않았는가). */
  const REAL_SYNC = `export const Orders = ({ orderOptions }: IOrdersProps) => {
  const [orders, setOrders] = useState<string[]>([]);
  useEffect(() => { setOrders(orderOptions ?? []); }, [orderOptions]);
  return orders.length;
};
`;
  const sync = runStaticRules([{ path: 'src/Orders.tsx', content: REAL_SYNC }], ALL_RULES, ALL_LANES);
  assert.ok(
    sync.some((reason) => reason.rule === 'quality/copy-state'),
    `서버 데이터를 state 로 밀어넣는 useEffect 를 놓쳤다: ${JSON.stringify(sync)}`,
  );
  console.log('✅ 복사본 state: 식별자를 넣는 동기화는 계속 잡는다');

  /* 11. 규칙 전수 조사 — **19개 계약 규칙 전부**를 known-positive/known-negative 쌍으로 문다.
   *
   * 배경: `selftest.ts` 안에서 규칙 id 문자열이 몇 번 나오는지 세어 보니 11개가 **0번**이었다
   * (a11y/accessible-name · a11y/button-type · a11y/input-label · quality/early-return ·
   *  quality/nested-ternary · repo/braces-required · repo/no-class · repo/no-enum ·
   *  tailwind/class-legibility · tailwind/theme-hardcoded · ts/no-any). 그 규칙들이 조용히
   * 고장 나 있어도(정규식이 절대 안 맞아도) 아무도 몰랐을 것이다 — `quality/cohesion` 이
   * 그렇게 0건을 내고 있다가 정규식 가정 3개가 틀린 게 드러난 전례가 있다(위 코멘트 참고).
   *
   * 각 항목은 **그 규칙 id 가 나왔는지**로만 판정한다(다른 규칙이 같이 나와도 무방하다).
   * `positive` 는 그 규칙을 어기는 최소 코드, `negative` 는 「비슷하지만 옳은」 코드 —
   * 특히 negative 는 임의로 만든 게 아니라 **규칙의 `fix` 문구가 권하는 대안**을 그대로 썼다
   * (예: a11y/semantic-element → `role` + `tabIndex` + `onKeyDown`, a11y/img-alt → `alt` 부여).
   * 서로 다른 규칙이 딸려 오지 않도록 각 조각은 그 규칙 하나만 어기게 최소로 짰다
   * (예: accessible-name 의 positive 에 `type="button"` 을 넣어 button-type 이 같이 물지
   * 않게 한다 — 안 그러면 「이 규칙이 물었다」를 그 규칙 하나로 증명할 수 없다).
   */

  /**
   * ⚠️⚠️ 여기엔 **손으로 적은 `20`** 이 있었다 — 「수치를 손으로 적으면 낡는다」가
   * 관문 안에 있었던 것이다(R55 가 문서에서 잡은 것과 같은 종류 · 실측 R68).
   * ⇒ **두 산 값을 견준다.** 그리고 개수가 같아도 **다른 규칙**일 수 있으므로 집합으로 본다.
   */
  /**
   * **묶음에 안 든 규칙은 영영 안 돈다.**
   * 규칙 파일에 선언만 하고 `RULE_PRESETS` 에 안 넣으면 **한 번도 실행되지 않고**
   * 커버리지에도 안 잡힌다 — 조용히 죽은 규칙이다.
   * ⚠️ 소스를 훑을 때 **주석을 지운다.** 안 지웠더니 주석 속 예시 데이터(`id: 'a1'`)를
   * 규칙으로 셌다(실측 R68) — 감사하던 그 실수를 감사 도구가 그대로 했다.
   */
  const ruleDir = new URL('rules/', import.meta.url);
  const blankOut = (m: string): string => m.replace(/[^\n]/g, ' ');
  const declared = new Set<string>();
  for (const file of await fs.readdir(ruleDir)) {
    if (!file.endsWith('.ts') || file === 'index.ts') { continue; }
    const raw = await fs.readFile(new URL(file, ruleDir), 'utf8');
    const code = raw.replace(/\/\*[\s\S]*?\*\//g, blankOut).replace(/\/\/[^\n]*/g, blankOut);
    for (const found of code.matchAll(/id: '([\w/-]+)'/g)) { declared.add(found[1]); }
  }
  const notInPreset = [...declared].filter((id) => !ALL_RULES.some((rule) => rule.id === id));
  assert.ok(declared.size > 0, '규칙을 하나도 못 읽었다 — 훑개가 고장 났다(§8)');
  assert.deepEqual(notInPreset, [],
    `선언만 되고 묶음에 안 든 규칙 — 영영 안 돈다: ${notInPreset.join(' · ')}`);
  console.log(`✅ 선언된 규칙 ${declared.size}개가 전부 묶음에 들어 있다`);

  const matrixIds = new Set(RULE_MATRIX.map((entry) => entry.id));
  const presetIds = new Set(ALL_RULES.map((rule) => rule.id));
  const missingFromMatrix = [...presetIds].filter((id) => !matrixIds.has(id));
  const staleInMatrix = [...matrixIds].filter((id) => !presetIds.has(id));
  assert.deepEqual(missingFromMatrix, [], `매트릭스에 없는 규칙 — 물어도 아무도 모른다: ${missingFromMatrix.join(' · ')}`);
  assert.deepEqual(staleInMatrix, [], `매트릭스에만 있는 규칙 — 이제 없는 것이다: ${staleInMatrix.join(' · ')}`);

  let matrixFailures = 0;
  for (const testCase of RULE_MATRIX) {
    const positiveReasons = runStaticRules([{ path: testCase.path, content: testCase.positive }], ALL_RULES, ALL_LANES);
    const bit = positiveReasons.some((reason) => reason.rule === testCase.id);
    if (!bit) {
      matrixFailures += 1;
      console.log(`  ❌ ${testCase.id} — known-positive 를 안 물었다: ${JSON.stringify(positiveReasons)}`);
    }

    const negativeReasons = runStaticRules([{ path: testCase.path, content: testCase.negative }], ALL_RULES, ALL_LANES);
    const falsePositive = negativeReasons.some((reason) => reason.rule === testCase.id);
    if (falsePositive) {
      matrixFailures += 1;
      console.log(`  ❌ ${testCase.id} — known-negative 인데 오탐했다: ${JSON.stringify(negativeReasons)}`);
    }

    if (bit && !falsePositive) {
      console.log(`  ✅ ${testCase.id} — known-positive 를 물고 known-negative 는 통과시킨다`);
    }
  }
  /* ⛔ **적어 둔 오탐 모양마다 known-negative 가 있는가**(R127).
     주석에만 적으면 기계가 못 센다 — `quality/magic-number` 가 셋을 적어 두고 하나도 안
     넣은 채 지나갔다(R126). 이제 `falsePositives` 에 적으면 **시험이 요구한다.** */
  for (const rule of ALL_RULES) {
    for (const label of rule.falsePositives ?? []) {
      const row = RULE_MATRIX.find((r) => r.id === rule.id);
      assert.ok(row?.negative?.includes(`fp: ${label}`),
        `${rule.id} 이 오탐 「${label}」 을 적어 뒀는데 known-negative 에 그 모양이 없다 — 가드를 풀어도 아무도 모른다`);
    }
  }
  console.log('✅ 적어 둔 오탐 모양마다 known-negative 가 있다');

  assert.equal(matrixFailures, 0, `규칙 전수 조사에서 ${matrixFailures}건 실패 — 위 ❌ 줄을 보라`);
  console.log(`✅ 규칙 전수 조사: ${RULE_MATRIX.length}개 규칙 전부 known-positive 를 물고 known-negative 를 통과시킨다`);

  await wikiExtractionSelftest();

  console.log('\n계약 패키지 전부 통과.');
};

/* ⚠️ **불러오기만 해도 돌면 안 된다.** `fixtures/messy-galaxy/generate.mjs` 가 이 파일에서
   `RULE_MATRIX` 를 가져가는데, 그때 selftest 전체가 같이 돌아 출력이 두 벌로 섞였다.
   진입점일 때만 돈다. */
if (process.argv[1] && import.meta.filename === process.argv[1]) {
  void main();
}
