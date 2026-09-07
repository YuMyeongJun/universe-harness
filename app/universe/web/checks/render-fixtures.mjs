/**
 * **픽스처를 화면에 실제로 물려서 그려 본다.** — 이 화면의 「끝냈다」는 여기서 증명된다.
 *
 * ⛔⛔ 「화면이 그렇게 그립니다」는 **주장이지 측정이 아니다.** 이 저장소의 실측이다:
 * 에이전트가 「새 동작은 검증했다」고 적었는데 사실이 아니었고 게이트는 초록이었다.
 * ⇒ 이 스크립트는 **진짜 컴포넌트를**(`RunReportView`) react-dom/server 로 그려서,
 *   화면에 **실제로 찍힌 글자**를 보고 판정한다. 스냅샷이 아니라 문장을 본다.
 *
 * 무엇을 어떻게 얻는가:
 *   1. 판정 계약의 픽스처(`qa/tests/fixtures/run/*.json`)를
 *   2. **도구에 그대로 물려**(`tc-run … --json`) 주행 결과를 얻고 — ⛔ 화면이 다시 세지 않는다
 *   3. 그 출력을 **화면에 물려** 그린 뒤
 *   4. 화면에 찍힌 글자에서 **있어야 할 문장 · 있으면 안 되는 문장**을 확인한다.
 *
 * 쓰임:  node web/checks/render-fixtures.mjs        (app/universe 에서)
 * 종료:  0 전부 통과 · 1 하나라도 어긋남
 *
 * ⚠️ `web/src` 밖에 두었다 — 은하 `console` 의 훑개가 보는 곳은 `web/src` 이고,
 *    검사 도구가 그 분모에 섞이면 「별이 몇 개인가」가 흐려진다.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const webSrc = path.join(here, '..', 'src');
const universeRoot = path.join(here, '..', '..', '..', '..');
const qaDir = path.join(universeRoot, 'qa');

/** 도구를 실제로 돌려 주행 결과를 받는다. ⛔ 화면이 쓸 값을 스크립트가 지어내지 않는다. */
const runTool = (fixture) => {
  const file = path.join('tests', 'fixtures', 'run', `${fixture}.json`);
  const ran = spawnSync('npx', ['--no-install', 'tsx', 'src/run/cli.ts', file, '--json'], {
    cwd: qaDir,
    encoding: 'utf8',
  });
  /* ⭐ 계약: `--json` 이면 종료 코드가 1·3 이어도 stdout 은 **항상 유효 JSON**이다. */
  if (ran.stdout.trim() === '') {
    throw new Error(`tc-run 이 아무것도 안 뱉었다 (${fixture}) — ${ran.stderr}`);
  }
  return { payload: JSON.parse(ran.stdout), exitCode: ran.status };
};

const ENTRY = `
import { renderToStaticMarkup } from 'react-dom/server';
import { RunReportView } from '@components/data-display/RunReportView';

export const draw = (payload) => renderToStaticMarkup(<RunReportView payload={payload} />);
`;

/** 화면을 **진짜로 그린다** — 컴포넌트를 번들해서 node 에서 실행한다. */
const buildRenderer = async () => {
  const esbuild = await import('esbuild');
  const out = path.join(mkdtempSync(path.join(tmpdir(), 'universe-run-view-')), 'view.mjs');
  const entry = path.join(here, '.entry.tsx');
  writeFileSync(entry, ENTRY, 'utf8');
  /* ⚠️ react·react-dom 까지 **통째로 번들한다.** 산출을 임시 폴더에 두면 node 가
     `react-dom` 을 그 자리에서 못 찾는다(실측: ERR_MODULE_NOT_FOUND). */
  await esbuild.build({
    entryPoints: [entry],
    outfile: out,
    bundle: true,
    format: 'esm',
    platform: 'node',
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
    /* ⚠️ react-dom/server 는 node 빌드가 CJS 라 `require('stream')` 을 쓴다. ESM 산출에서는
       그 자리가 「Dynamic require is not supported」로 죽는다(실측) — require 를 만들어 준다. */
    banner: {
      js: "import { createRequire as makeRequire } from 'node:module'; const require = makeRequire(import.meta.url);",
    },
    alias: {
      '@components': path.join(webSrc, 'components'),
      '@api': path.join(webSrc, 'api'),
      '@lib': path.join(webSrc, 'lib'),
      '@routes': path.join(webSrc, 'routes'),
    },
    logLevel: 'error',
  });
  /* 검사 도구가 저장소에 찌꺼기를 남기지 않는다 — 입구 파일은 지운다. */
  rmSync(entry, { force: true });
  const mod = await import(pathToFileURL(out).href);
  return mod.draw;
};

/** 태그를 걷어내고 **사람이 읽는 글자만** 남긴다 — 판정은 문장으로 한다. */
const textOf = (markup) =>
  markup
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * 픽스처마다 **있어야 할 문장 · 있으면 안 되는 문장.**
 * ⛔ 「그려졌다」로는 부족하다 — 무엇이라고 그렸는지를 본다.
 */
const CHECKS = [
  {
    fixture: 'unjudged',
    exitCode: 1,
    must: [
      '판단하지 않은 것 1건',
      'TC-102',
      '아직 판단하지 않았다',
      /* ⛔ 무더기마다 **분모와 함께** 센다 — 구현에서 뽑은 TC 가 통과 무더기에 섞이면 여기서 걸린다. */
      '⛔ 아직 판단하지 않은 fail — 이것이 0이 될 때까지 안 끝난다 — 전체 4건 중 1건',
      '⛔ 자기 채점 — 구현에서 뽑은 TC. 검증으로 세지 않는다 — 전체 4건 중 1건',
      '✅ 검증된 통과 — 여기 있는 것만 「재서 통과했다」다 — 전체 4건 중 1건',
      'TC-103',
    ],
    mustNot: ['이 주행은 끝났다'],
  },
  {
    fixture: 'session-died',
    exitCode: 3,
    must: [
      '못 쟀다',
      '전제가 서지 않았다',
      '⚪ 못 잰 것 — 실패가 아니다 — 전체 4건 중 4건',
      '못 쟀다 — 전제가 안 섰다',
    ],
    /* ⛔ 세션이 죽은 주행을 fail 목록에 올리면 사람이 엉뚱한 데를 판다. */
    mustNot: [
      '이 주행은 끝났다',
      '⛔ 아직 판단하지 않은 fail — 이것이 0이 될 때까지 안 끝난다 — 전체 4건 중 1건',
      '⛔ 아직 판단하지 않은 fail — 이것이 0이 될 때까지 안 끝난다 — 전체 4건 중 4건',
    ],
  },
  {
    fixture: 'weak-accepted',
    exitCode: 1,
    must: [
      '판단하지 않은 것 1건',
      'TC-104',
      '최소 30자',
      '판단으로 세지 않았다',
    ],
    mustNot: ['이 주행은 끝났다'],
  },
  {
    fixture: 'good',
    exitCode: 0,
    must: ['이 주행은 끝났다', '판단하지 않은 것 0건', '「fail 0」이라서가 아니다'],
    mustNot: ['아직 판단하지 않았다'],
  },
  {
    fixture: 'derived-only',
    exitCode: 3,
    must: ['못 쟀다', '분모가 0이다', '자기 채점'],
    mustNot: ['이 주행은 끝났다'],
  },
  /**
   * ⛔⛔ **도구가 접지 않고 보내면 화면이 접는가.**
   * ⚠️ `session-died.json` 만으로는 이 자리가 **안 재진다** — 도구가 이미 ⚪ 로 접어서 주기
   * 때문에, 화면의 접는 코드를 통째로 지워도 그 픽스처는 초록이었다(변이로 확인했다).
   * ⇒ 도구가 **안 접은 것처럼** 상태를 되돌려 물린다. 전제가 안 선 주행의 ❌ 는 ⚪ 다.
   */
  {
    label: 'unfolded-session-died (도구가 접지 않고 ❌ 로 보냈다 — measurable 은 false 그대로)',
    fixture: 'session-died',
    exitCode: 3,
    mutate: (payload) => {
      for (const one of payload.cases) {
        one.status = one.foldedFrom ?? one.status;
      }
      return payload;
    },
    must: [
      '전제가 안 섰는데',
      '⚪ 못 잰 것 — 실패가 아니다 — 전체 4건 중 4건',
      '못 쟀다 — 전제가 안 섰다',
    ],
    mustNot: [
      '이 주행은 끝났다',
      '⛔ 아직 판단하지 않은 fail — 이것이 0이 될 때까지 안 끝난다 — 전체 4건 중 4건',
      '판단이 붙은 fail — 고쳤다 · 테스트가 틀렸다 · 받아들인다 — 전체 4건 중 4건',
    ],
  },
  /**
   * ⛔⛔ **도구가 거짓말을 하면 화면은 어떻게 하는가.**
   * 화면이 도구를 무조건 믿으면, 도구가 무르는 날 화면도 함께 무른다. 그래서
   * 「끝났다」고 적힌 결과에서 fail 하나의 판단만 지워 물려 본다 — 픽스처에는 없는 상태다.
   */
  {
    label: 'lying-tool (good.json 에서 TC-102 의 판단만 지웠다 — done 은 true 그대로)',
    fixture: 'good',
    exitCode: 0,
    mutate: (payload) => {
      for (const one of payload.cases) {
        if (one.id === 'TC-102') one.verdict = null;
      }
      return payload;
    },
    must: ['도구의 셈과 화면이 본 것이 다르다', 'TC-102 은 fail 인데 판단', '아직 판단하지 않았다'],
    mustNot: ['이 주행은 끝났다'],
  },
];

const main = async () => {
  const draw = await buildRenderer();
  let broken = 0;

  for (const check of CHECKS) {
    const { payload, exitCode } = runTool(check.fixture);
    const text = textOf(draw(check.mutate ? check.mutate(payload) : payload));
    const missing = check.must.filter((line) => !text.includes(line));
    const present = check.mustNot.filter((line) => text.includes(line));
    const codeOk = exitCode === check.exitCode;
    const ok = missing.length === 0 && present.length === 0 && codeOk;
    if (!ok) broken += 1;

    console.log(
      `\n${ok ? '✅' : '❌'} ${check.label ?? check.fixture} — tc-run exit ${exitCode} (기대 ${check.exitCode})`,
    );
    for (const line of missing) console.log(`   ⛔ 화면에 없다: "${line}"`);
    for (const line of present) console.log(`   ⛔ 화면에 있으면 안 된다: "${line}"`);
    console.log(`   화면 첫 줄: ${text.slice(0, 200)}`);
  }

  console.log(`\n${broken === 0 ? '✅ 전부 통과' : `❌ 어긋난 픽스처 ${broken}개`}`);
  return broken === 0 ? 0 : 1;
};

process.exit(await main());
