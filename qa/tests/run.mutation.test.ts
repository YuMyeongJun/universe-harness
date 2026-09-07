/**
 * 주행 결과 계약 변이 시험 — **검사가 실제로 무는지** 본다. 초록불은 증거가 아니다.
 *
 * 네 자리를 일부러 깬다. 하나라도 안 물면 그 계약은 없는 계약이다:
 *   1. 전제가 하나라도 안 서면 → 케이스가 **전부 ⚪ 로 접히는가**
 *   2. `origin: derived-from-code` 가 → **검증 분모에서 빠지는가**
 *   3. `verdict: null` 인 fail 이 하나라도 있으면 → **「끝났다」고 말하지 않는가**
 *   4. `accepted` 인데 사유가 짧으면 → **판단으로 안 세는가**
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { MIN_ACCEPTED_WHY, validateVerdict } from '../src/run/contract.js';
import { buildRunReport, evaluateDone, measurabilityOf, type IRunInput } from '../src/run/report.js';
import { caseIdOf, fromPlaywrightJson, statusOf } from '../src/run/playwright.js';

const ROOT = new URL('..', import.meta.url).pathname;
const CLI = 'src/run/cli.ts';

const fixture = (name: string): IRunInput =>
  JSON.parse(readFileSync(`${ROOT}tests/fixtures/run/${name}`, 'utf8'));

const runCli = (args: string[]): { exitCode: number; stdout: string } => {
  try {
    return {
      exitCode: 0,
      stdout: execFileSync('npx', ['tsx', CLI, ...args], { cwd: ROOT, encoding: 'utf8' }),
    };
  } catch (error) {
    const e = error as { status: number | null; stdout: string };
    return { exitCode: e.status ?? -1, stdout: e.stdout };
  }
};

const of = (report: ReturnType<typeof buildRunReport>, id: string) =>
  report.cases.find((c) => c.id === id);

/* ────────────────────────────────────────────────────────────────────────── */

describe('기준선 — 안 깬 상태에서는 끝났다고 말한다', () => {
  const report = buildRunReport(fixture('good.json'));
  const done = evaluateDone(report);

  it('전제가 다 서면 measurable 이다', () => {
    expect(report.measurable).toBe(true);
  });
  it('분모를 들고 온다 — 검증 3건 (구현에서 나온 TC-103 은 빠졌다)', () => {
    expect(report.stats.total).toBe(4);
    expect(report.verification.denominator).toBe(3);
  });
  it('fail 2건이 다 판단됐으므로 끝났다 — 「fail 0」이라서가 아니다', () => {
    expect(report.stats.unexpected).toBe(2);
    expect(done.done).toBe(true);
    expect(done.exitCode).toBe(0);
  });
});

/* ── 변이 1 ───────────────────────────────────────────────────────────────── */

describe('변이 1 — 전제가 안 서면 케이스가 전부 ⚪ 로 접힌다', () => {
  const report = buildRunReport(fixture('session-died.json'));
  const done = evaluateDone(report);

  it('measurable 이 false 다', () => {
    expect(report.measurable).toBe(false);
    expect(report.unmeasurableBecause.join()).toMatch(/session-alive/);
  });
  it('⛔ 입력이 전부 failed 였는데 ❌ 로 세지 않는다 — 전부 ⚪ 다', () => {
    expect(fixture('session-died.json').cases.every((c) => c.status === 'failed')).toBe(true);
    expect(report.stats.unexpected).toBe(0);
    expect(report.stats.skipped).toBe(report.stats.total);
    expect(report.cases.every((c) => c.status === 'unmeasured')).toBe(true);
  });
  it('원래 상태를 잃지 않는다 — foldedFrom 에 남는다', () => {
    expect(of(report, 'TC-101')?.foldedFrom).toBe('failed');
  });
  it('⚪ 이므로 exit 3 — 실패도 통과도 아니다', () => {
    expect(done.done).toBe(false);
    expect(done.exitCode).toBe(3);
  });
  it('전제 선언이 0개여도 못 잰 것이다 — 「안 적었다」가 「다 섰다」로 접히지 않는다', () => {
    expect(measurabilityOf([]).measurable).toBe(false);
  });
  it('ok: null(확인 못 함)도 안 선 것으로 본다', () => {
    expect(measurabilityOf([{ id: 'x', ok: null }]).measurable).toBe(false);
  });
});

/* ── 변이 2 ───────────────────────────────────────────────────────────────── */

describe('변이 2 — 구현에서 나온 TC 는 검증 수에서 빠진다', () => {
  it('기준선에서 TC-103(derived-from-code) 만 분모 밖이다', () => {
    const report = buildRunReport(fixture('good.json'));
    expect(of(report, 'TC-103')?.countsAsVerification).toBe(false);
    expect(of(report, 'TC-101')?.countsAsVerification).toBe(true);
    expect(report.verification.excluded.derivedFromCode).toBe(1);
    expect(report.verification.selfScoringIds).toEqual(['TC-103']);
  });

  it('⛔ 전부 구현에서 나왔으면 초록 2건이어도 분모가 0 — 끝났다고 말하지 않는다', () => {
    const report = buildRunReport(fixture('derived-only.json'));
    const done = evaluateDone(report);
    expect(report.stats.expected).toBe(2); // 전부 초록이다
    expect(report.stats.unexpected).toBe(0); // fail 0 이다
    expect(report.verification.denominator).toBe(0); // 그런데 아무것도 검증 안 했다
    expect(done.done).toBe(false);
    expect(done.exitCode).toBe(3);
    expect(done.reason).toMatch(/분모/);
  });

  it('출처 미상(unknown)도 같은 취급 — 뭘 검증하는지 모르는 TC 다', () => {
    const input = fixture('good.json');
    const report = buildRunReport({
      ...input,
      cases: input.cases.map((c) => ({ ...c, origin: 'unknown' as const })),
    });
    expect(report.verification.denominator).toBe(0);
    expect(report.verification.excluded.unknownOrigin).toBe(4);
  });
});

/* ── 변이 3 ───────────────────────────────────────────────────────────────── */

describe('변이 3 — verdict: null 인 fail 이 하나라도 있으면 안 끝났다', () => {
  const report = buildRunReport(fixture('unjudged.json'));
  const done = evaluateDone(report);

  it('판단 안 한 fail 을 이름으로 부른다', () => {
    expect(done.unjudged.map((u) => u.id)).toEqual(['TC-102']);
    expect(done.unjudged[0]?.reason).toMatch(/verdict === null/);
  });
  it('done 이 false 이고 exit 1 이다', () => {
    expect(done.done).toBe(false);
    expect(done.exitCode).toBe(1);
  });
  it('⛔ 「fail 0」이 종료 조건이 아니다 — fail 을 지워서 초록을 만들 수 없다', () => {
    // 단언을 무르게 해서 fail 을 없앤 주행: 초록이지만 검증 분모가 줄어든 것이 보인다.
    const input = fixture('unjudged.json');
    const softened = buildRunReport({
      ...input,
      cases: input.cases.filter((c) => c.status !== 'failed'),
    });
    expect(evaluateDone(softened).done).toBe(true); // fail 0 이라 끝난 것처럼 보이는데
    expect(softened.verification.denominator).toBeLessThan(report.verification.denominator);
    // ⇒ 분모가 같이 줄었다. **분모를 안 보면 이 무름을 못 잡는다.**
  });
});

/* ── 변이 4 ───────────────────────────────────────────────────────────────── */

describe('변이 4 — accepted 인데 사유가 짧으면 판단으로 안 센다', () => {
  const report = buildRunReport(fixture('weak-accepted.json'));
  const done = evaluateDone(report);

  it(`"일단 넘어감"(${'일단 넘어감'.length}자)은 판단이 아니다 — 최소 ${MIN_ACCEPTED_WHY}자`, () => {
    expect(done.unjudged.map((u) => u.id)).toEqual(['TC-104']);
    expect(done.exitCode).toBe(1);
  });
  it('경계: 29자는 거부, 30자는 수용', () => {
    const why29 = 'ㄱ'.repeat(MIN_ACCEPTED_WHY - 1);
    const why30 = 'ㄱ'.repeat(MIN_ACCEPTED_WHY);
    expect(validateVerdict({ kind: 'accepted', why: why29 }).valid).toBe(false);
    expect(validateVerdict({ kind: 'accepted', why: why30 }).valid).toBe(true);
  });
  it('길이만 채운 자리표시자도 거부한다', () => {
    expect(validateVerdict({ kind: 'accepted', why: '  나중에  ' }).valid).toBe(false);
    expect(validateVerdict({ kind: 'accepted', why: `${' '.repeat(40)}` }).valid).toBe(false);
  });
  it('fixed · test-wrong 은 행위가 증거라 길이를 안 본다 — 그래도 빈 사유는 거부', () => {
    expect(validateVerdict({ kind: 'fixed', why: '조건식 고침' }).valid).toBe(true);
    expect(validateVerdict({ kind: 'test-wrong', why: '셀렉터 오타' }).valid).toBe(true);
    expect(validateVerdict({ kind: 'fixed', why: '   ' }).valid).toBe(false);
  });
  it('모르는 판단 종류는 판단이 아니다', () => {
    expect(validateVerdict({ kind: 'wontfix' as 'fixed', why: '길게 적어도 소용없다'.repeat(5) }).valid).toBe(
      false,
    );
  });
});

/* ── Playwright 어댑터 ───────────────────────────────────────────────────── */

describe('Playwright 어댑터 — 옮기면서 뜻이 바뀌지 않는다', () => {
  const pw = JSON.parse(readFileSync(`${ROOT}tests/fixtures/run/playwright-report.json`, 'utf8'));
  const origins = JSON.parse(readFileSync(`${ROOT}tests/fixtures/run/origins.json`, 'utf8'));
  const report = buildRunReport(fromPlaywrightJson(pw, { origins }));

  it('flaky 를 통과로 접지 않는다 — 갈리는 관측은 ⚪ 다', () => {
    expect(statusOf('flaky').status).toBe('unmeasured');
    expect(of(report, 'TC-203')?.status).toBe('unmeasured');
    expect(report.stats.flaky).toBe(1);
  });
  it('제목에서 TC id 를 집는다. 없으면 파일+제목으로 유일하게 만든다', () => {
    expect(caseIdOf({ title: 'TC-201 무엇' })).toBe('TC-201');
    expect(caseIdOf({ title: '번호 없음', file: 'a.spec.ts' })).toBe('a.spec.ts › 번호 없음');
  });
  it('origins 에 없는 테스트는 unknown 이고 검증 분모 밖이다', () => {
    const nameless = report.cases.find((c) => c.id.includes('제목에 TC 번호가 없는'));
    expect(nameless?.origin).toBe('unknown');
    expect(nameless?.countsAsVerification).toBe(false);
  });
  it('검증 분모는 policy/human 이면서 잰 것만 — 5건 중 2건', () => {
    expect(report.stats.total).toBe(5);
    expect(report.verification.denominator).toBe(2); // TC-201 passed · TC-202 failed
  });
  it('스크린샷을 증거로 옮긴다', () => {
    expect(of(report, 'TC-202')?.evidence?.screenshot).toBe('shots/TC-202.png');
  });
  it('⛔ 테스트 0개는 「위반 없음」이 아니다 — 전제로 막는다', () => {
    const empty = buildRunReport(fromPlaywrightJson({ suites: [], errors: [] }));
    expect(empty.measurable).toBe(false);
    expect(evaluateDone(empty).exitCode).toBe(3);
  });
  it('주행 자체가 에러를 냈으면 전제가 안 선다', () => {
    const broken = fromPlaywrightJson(pw, { origins, preconditions: [] });
    expect(broken.preconditions.find((p) => p.id === 'playwright-run-clean')?.ok).toBe(true);
    const withErrors = fromPlaywrightJson({ ...pw, errors: [{ message: 'config 못 읽음' }] });
    expect(withErrors.preconditions.find((p) => p.id === 'playwright-run-clean')?.ok).toBe(false);
  });
});

/* ── CLI 출력 계약 ───────────────────────────────────────────────────────── */

describe('tc-run CLI — 돈 이상 stdout 은 항상 유효 JSON 이다', () => {
  const PATHS: Array<{ name: string; args: string[]; expect: number }> = [
    { name: '끝났다', args: ['--json', 'tests/fixtures/run/good.json'], expect: 0 },
    { name: '판단 안 한 fail', args: ['--json', 'tests/fixtures/run/unjudged.json'], expect: 1 },
    { name: '짧은 accepted', args: ['--json', 'tests/fixtures/run/weak-accepted.json'], expect: 1 },
    { name: '전제 안 섰다', args: ['--json', 'tests/fixtures/run/session-died.json'], expect: 3 },
    { name: '분모 0', args: ['--json', 'tests/fixtures/run/derived-only.json'], expect: 3 },
    { name: '파일 없음', args: ['--json', 'tests/fixtures/run/없다.json'], expect: 3 },
    { name: '인자 없음', args: ['--json'], expect: 3 },
    { name: '모양이 아니다', args: ['--json', 'package.json'], expect: 3 },
  ];

  for (const p of PATHS) {
    it(`${p.name} → exit ${p.expect} · stdout 은 유효 JSON`, () => {
      const r = runCli(p.args);
      expect(r.exitCode).toBe(p.expect);
      const parsed = JSON.parse(r.stdout);
      expect(parsed.tool).toBe('tc-run');
      expect(parsed.ran).toBe(true);
      expect(parsed.exitCode).toBe(p.expect);
    });
  }

  it('--from-playwright 로도 돈다', () => {
    const r = runCli([
      '--json',
      'tests/fixtures/run/playwright-report.json',
      '--from-playwright',
      '--origins',
      'tests/fixtures/run/origins.json',
    ]);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.verification.denominator).toBe(2);
    expect(r.exitCode).toBe(1); // TC-202 fail 에 판단이 없다
  });
});
