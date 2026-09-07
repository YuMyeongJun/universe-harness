/**
 * 소비 쪽(qa-workflow)이 넘긴 회귀 표본.
 *
 * 사내 식별자는 **보내는 쪽에서** 걷어내 왔고, 받아서 한 번 더 확인했다
 * (도메인·서비스·메뉴·역할명 전부 중립어. 행 구조와 위반 패턴은 보존).
 *
 * ⚠️ NFD 폴더는 **커밋하지 않고 시험 시점에 만든다.**
 *    파일 이름의 정규화는 체크아웃·압축·전송 과정에서 바뀔 수 있어서,
 *    커밋된 폴더 이름에 기대면 그 시험이 조용히 무의미해진다.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..');
const FIXTURES = join(import.meta.dirname, 'fixtures/handoff');
const CLI = join(ROOT, 'src/lint/cli.ts');

let featuresDir = '';

/** `mkdir` 에 **명시적 NFD 문자열**을 주면 APFS 는 그 형식을 보존한다 — zip 이 필요 없다. */
beforeAll(() => {
  featuresDir = join(mkdtempSync(join(tmpdir(), 'tc-lint-nfd-')), 'features');
  mkdirSync(featuresDir, { recursive: true });
  for (const name of ['업무', '설정']) mkdirSync(join(featuresDir, name.normalize('NFD')));
  for (const name of ['_common', '_enduser']) mkdirSync(join(featuresDir, name));
});

afterAll(() => {
  if (featuresDir !== '') rmSync(join(featuresDir, '..'), { recursive: true, force: true });
});

interface IResult {
  exitCode: number;
  json: {
    ok: boolean;
    violations: number;
    unmeasured: number;
    findings: Array<{ rule: string; severity: string; tab?: string; rowIndex?: number }>;
  };
}

const run = (spec: string, extra: string[] = []): IResult => {
  const args = ['tsx', CLI, '--format', 'sheet', '--json', ...extra, join(FIXTURES, spec)];
  try {
    const out = execFileSync('npx', args, { cwd: ROOT, encoding: 'utf8' });
    return { exitCode: 0, json: JSON.parse(out) };
  } catch (error) {
    const e = error as { status: number; stdout: string };
    return { exitCode: e.status, json: JSON.parse(e.stdout) };
  }
};

describe('넘겨받은 회귀 표본', () => {
  it('NFD 폴더가 실제로 NFD 로 만들어졌다 — 전제 확인', () => {
    // 이 확인이 없으면, 파일시스템이 정규화를 바꿔 버렸을 때 아래 시험이 조용히 무의미해진다.
    const names = readdirSync(featuresDir);
    const nfd = names.filter((n) => n !== n.normalize('NFC'));
    expect(nfd.length, `NFD 폴더가 0개다. 이 파일시스템에서는 NFD 시험이 성립하지 않는다: ${names.join(', ')}`)
      .toBeGreaterThan(0);
  });

  it('정상 표본은 NFD 폴더 대상으로 통과한다', () => {
    const { exitCode, json } = run('spec-clean.json', ['--features-dir', featuresDir]);
    expect(json.findings.filter((f) => f.severity === 'violation')).toEqual([]);
    expect(exitCode).toBe(0);
  });

  it('정규화 없이는 통과하지 못한다 — 시험이 실제로 그 자리를 겨눈다', () => {
    // NFC 로 적힌 스펙 값과 NFD 폴더 이름은 JS 문자열로 다른 값이다.
    const dirs = readdirSync(featuresDir);
    expect(dirs.includes('업무')).toBe(false); // 정규화 전에는 못 찾는다
    expect(dirs.map((d) => d.normalize('NFC')).includes('업무')).toBe(true);
  });

  it('위반 표본은 심어 둔 규칙들을 잡는다', () => {
    const { exitCode, json } = run('spec-dirty.json', ['--features-dir', featuresDir]);
    expect(exitCode).toBe(1);
    const rules = new Set(json.findings.filter((f) => f.severity === 'violation').map((f) => f.rule));
    // 한 행에 하나씩 의도적으로 심어 둔 위반들
    for (const rule of [
      'G0-empty-action',
      'G0-single-point',
      'G1-number-binding',
      'G2-no-particle',
      'G2-terminal-noun',
      'G3-abbrev-consistency',
      'G3-terminal',
      'G4-precondition-form',
      'G5-category-consistency',
      'G5-major-dictionary',
      'G7-banned-words',
      'initial-values',
      'no-ids-in-spec',
      'tab-placeholder',
    ]) {
      expect(rules, `${rule} 이 위반 표본에서 물지 않았다`).toContain(rule);
    }
  });

  it('`_common` 을 대분류로 쓰면 위반이다 — 언더스코어 폴더는 대분류가 아니다', () => {
    const { json } = run('spec-dirty.json', ['--features-dir', featuresDir]);
    const hit = json.findings.find(
      (f) => f.rule === 'G5-major-dictionary' && f.severity === 'violation',
    );
    expect(hit?.rowIndex).toBe(3); // `_common` 을 쓴 행
  });

  it('행 위치를 기계가 되짚을 수 있다', () => {
    const { json } = run('spec-dirty.json', ['--features-dir', featuresDir]);
    const empty = json.findings.find((f) => f.rule === 'G0-empty-action');
    expect(empty?.tab).toBe('컴포넌트1');
    expect(empty?.rowIndex).toBe(2);
  });
});

describe('도메인 오지정 검출 (의도하지 않은 효과)', () => {
  /**
   * 소비 쪽이 배선하다 발견한 것 — `--features-dir` 를 도메인별로 넘기면
   * **같은 스펙을 다른 도메인 폴더로 겨눌 때 즉시 걸린다.**
   *
   * 그쪽 시스템에서 이건 실재하는 사고 유형이다: 잡 파라미터 하나로 지식 로딩이
   * 전부 갈리는데, 잘못 고르면 **엉뚱한 도메인 지식으로 그럴듯한 TC 가 생성돼**
   * 시트로 나갔다. 사람이 검토하다 걸러야 했다.
   *
   * 의도한 규칙이 아니라 부수 효과라서, 적어 두지 않으면 다음 사람이 모르고 없앤다.
   */
  it('다른 도메인의 폴더로 겨누면 대분류가 안 맞아 걸린다', () => {
    const other = join(mkdtempSync(join(tmpdir(), 'tc-lint-other-')), 'features');
    mkdirSync(other, { recursive: true });
    // spec-clean 의 대분류는 `업무`·`설정` 인데, 이 도메인의 LNB 는 전혀 다르다
    for (const name of ['분석', '이력']) mkdirSync(join(other, name));

    const { exitCode, json } = run('spec-clean.json', ['--features-dir', other]);
    expect(exitCode).toBe(1);
    const hits = json.findings.filter((f) => f.rule === 'G5-major-dictionary' && f.severity === 'violation');
    expect(hits.length).toBeGreaterThan(0);

    rmSync(join(other, '..'), { recursive: true, force: true });
  });

  it('맞는 도메인 폴더로 겨누면 통과한다 — 대비가 있어야 검출이 뜻을 갖는다', () => {
    // 이 대비가 없으면 "항상 걸리는 검사"와 구별되지 않는다
    const { exitCode } = run('spec-clean.json', ['--features-dir', featuresDir]);
    expect(exitCode).toBe(0);
  });
});
