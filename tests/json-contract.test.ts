/**
 * `--json` 출력 계약 시험.
 *
 * ⭐ **계약: 린터가 돈 이상 stdout 은 항상 유효 JSON 이다.**
 *    stdout 이 비어 있다는 것은 오직 **린터가 아예 안 돌았다**는 뜻이다.
 *
 * 왜 필요한가 — 종료 코드로는 구분이 안 되기 때문이다. 실측:
 *
 *   빌드 안 함 (스크립트 없음) → node 가 자기 에러로 **exit 1**
 *   위반 있음                 → **exit 1**
 *
 * 두 값이 같다. 「도구가 없다」와 「TC 에 위반이 있다」를 종료 코드로 가르면
 * **도구가 설치 안 된 것을 TC 탓으로 돌리는 실패**가 난다.
 * 그래서 소비 쪽은 stdout 파싱을 판별자로 쓰고, 이 시험이 그 보장을 지킨다.
 */
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const ROOT = new URL('..', import.meta.url).pathname;
const CLI = 'src/lint/cli.ts';

interface IRun {
  exitCode: number;
  stdout: string;
}

const run = (args: string[]): IRun => {
  try {
    return { exitCode: 0, stdout: execFileSync('npx', ['tsx', CLI, ...args], { cwd: ROOT, encoding: 'utf8' }) };
  } catch (error) {
    const e = error as { status: number | null; stdout: string };
    return { exitCode: e.status ?? -1, stdout: e.stdout };
  }
};

/** 린터가 스스로 판정하는 모든 종료 경로 — 새 경로가 생기면 여기 추가해야 한다 */
const EXIT_PATHS: Array<{ name: string; args: string[]; expect: number }> = [
  { name: '정상 (마크다운)', args: ['--json', 'tests/fixtures/good.md'], expect: 0 },
  { name: '위반 (마크다운)', args: ['--json', 'tests/fixtures/weak-negative.md'], expect: 1 },
  { name: '정상 (시트)', args: ['--format', 'sheet', '--json', 'tests/fixtures/sheet/good.json'], expect: 0 },
  {
    name: '위반 (시트)',
    args: ['--format', 'sheet', '--json', 'tests/fixtures/handoff/spec-dirty.json'],
    expect: 1,
  },
  { name: '대상 0건', args: ['--format', 'sheet', '--json', './없는디렉토리'], expect: 3 },
  {
    name: 'features-dir 누락',
    args: ['--format', 'sheet', '--json', '--require-features-dir', 'tests/fixtures/sheet/good.json'],
    expect: 3,
  },
  {
    name: 'features-dir 를 못 읽음',
    args: ['--format', 'sheet', '--json', '--features-dir', './없는폴더', 'tests/fixtures/sheet/good.json'],
    expect: 3,
  },
  {
    name: '형식 이름이 틀림',
    args: ['--format', 'bogus', '--json', 'tests/fixtures/sheet/good.json'],
    expect: 3,
  },
];

describe('--json 계약 — 린터가 돌면 반드시 유효 JSON', () => {
  for (const { name, args, expect: expected } of EXIT_PATHS) {
    it(`${name} → exit ${expected} 이고 stdout 이 유효 JSON`, () => {
      const { exitCode, stdout } = run(args);
      expect(exitCode).toBe(expected);
      expect(stdout.length, `${name}: stdout 이 비었다 — 소비 쪽이 "도구 미실행"으로 오분류한다`)
        .toBeGreaterThan(0);
      const parsed = JSON.parse(stdout) as Record<string, unknown>;
      expect(parsed['tool']).toBe('tc-lint');
      expect(parsed['ran']).toBe(true);
      expect(parsed['exitCode']).toBe(expected);
      expect(Array.isArray(parsed['findings'])).toBe(true);
    });
  }

  it('린터가 안 돌면 stdout 이 비어 있다 — 그것이 유일한 구분자다', () => {
    // 빌드 안 함 / 클론 안 함. node 가 자기 에러로 exit 1 을 내므로 종료 코드로는 위반과 구별되지 않는다.
    let stdout = '';
    let exitCode = 0;
    try {
      execFileSync('node', ['./없는파일.js', '--json'], { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' });
    } catch (error) {
      const e = error as { status: number | null; stdout: string };
      exitCode = e.status ?? -1;
      stdout = e.stdout;
    }
    expect(exitCode, '스크립트가 없으면 node 가 exit 1 을 낸다 — 위반과 같은 값이다').toBe(1);
    expect(stdout).toBe('');
  });

  it('사람용 출력에는 JSON 을 섞지 않는다', () => {
    // --json 없이 부르면 stdout 이 JSON 이 아니어야 한다. 섞이면 양쪽 다 못 쓴다.
    const { stdout } = run(['tests/fixtures/good.md']);
    expect(() => JSON.parse(stdout)).toThrow();
  });
});
