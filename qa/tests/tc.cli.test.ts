/**
 * **입구 두 개(`tc-form` · `tc-draft`)의 종료 코드와 계약** — 화면 문구가 아니라 **동작**을 잰다.
 *
 * ⭐ 계약: `--json` 이면 도구가 돈 이상 stdout 은 **항상 유효 JSON** 이다 — `exit 3` 에서도.
 *    (`tc-lint`·`tc-run` 과 같은 계약. 종료 코드만으로는 「도구가 없다」와 「TC 가 나빴다」를 못 가른다.)
 *
 * ⛔⛔ 그리고 **돈**: `tc-draft` 는 `--write` 없이는 모델을 **한 번도** 안 불러야 한다.
 *    「안 불렀다」를 화면 문구로 믿지 않는다 — PATH 에 가짜 `claude` 를 놓고 **불렸는지 세어서** 잰다.
 */
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = new URL('..', import.meta.url).pathname;
const FORM = 'src/tc/cli.ts';
const DRAFT = 'src/tc/draft-cli.ts';

interface IRun {
  exitCode: number;
  stdout: string;
  stderr: string;
}

const run = (cli: string, args: string[], env: NodeJS.ProcessEnv = {}): IRun => {
  try {
    return {
      exitCode: 0,
      stdout: execFileSync('npx', ['tsx', cli, ...args], {
        cwd: ROOT,
        encoding: 'utf8',
        env: { ...process.env, ...env },
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
      stderr: '',
    };
  } catch (error) {
    const e = error as { status: number | null; stdout: string; stderr: string };
    return { exitCode: e.status ?? -1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
};

const tmp = (): string => mkdtempSync(join(tmpdir(), 'tc-cli-'));
const TAB = '\t';
const HEAD = `id${TAB}origin${TAB}status${TAB}attribution${TAB}verdict.kind${TAB}verdict.why`;

const write = (dir: string, name: string, body: string): string => {
  const path = join(dir, name);
  writeFileSync(path, body, 'utf8');
  return path;
};

const okPre = (dir: string): string => write(dir, 'pre.tsv', `id${TAB}ok\n세션${TAB}yes\n`);

describe('tc-form — 종료 코드는 **계약이 정한다**', () => {
  const dir = tmp();
  const pre = okPre(dir);

  it('판단 붙은 fail 만 있으면 0 — 「fail 0」이라서가 아니다', () => {
    const cases = write(
      dir,
      'ok.tsv',
      `${HEAD}\nTC-1${TAB}policy${TAB}failed${TAB}star${TAB}fixed${TAB}셀렉터를 고쳤다\n`,
    );
    expect(run(FORM, ['--cases', cases, '--preconditions', pre]).exitCode).toBe(0);
  });

  it('판단하지 않은 fail 이 있으면 1', () => {
    const cases = write(dir, 'unjudged.tsv', `${HEAD}\nTC-1${TAB}policy${TAB}failed${TAB}star${TAB}${TAB}\n`);
    expect(run(FORM, ['--cases', cases, '--preconditions', pre]).exitCode).toBe(1);
  });

  it('전제 양식을 안 주면 3 — 「전제 0개」는 통과가 아니라 **못 쟀다**', () => {
    const cases = write(dir, 'nopre.tsv', `${HEAD}\nTC-1${TAB}policy${TAB}passed${TAB}star${TAB}${TAB}\n`);
    const r = run(FORM, ['--cases', cases]);
    expect(r.exitCode).toBe(3);
  });

  it('전부 검증 분모 밖이면 3 — 통과가 아니다', () => {
    const cases = write(dir, 'derived.tsv', `${HEAD}\nTC-1${TAB}derived-from-code${TAB}passed${TAB}star${TAB}${TAB}\n`);
    expect(run(FORM, ['--cases', cases, '--preconditions', pre]).exitCode).toBe(3);
  });

  it('케이스를 0줄 읽으면 3 — 「TC 가 없다」가 아니라 못 쟀다', () => {
    const cases = write(dir, 'empty.tsv', `${HEAD}\n`);
    const r = run(FORM, ['--cases', cases, '--preconditions', pre]);
    expect(r.exitCode).toBe(3);
    expect(r.stderr).toMatch(/0줄/);
  });

  it('.xlsx 는 못 읽는다고 말한다 — 빈 표로 읽지 않는다', () => {
    const cases = write(dir, 'x.xlsx', 'PK');
    const r = run(FORM, ['--cases', cases, '--preconditions', pre]);
    expect(r.exitCode).toBe(3);
    expect(r.stderr).toMatch(/확장자/);
  });

  it('⛔ 모르는 플래그를 거부한다 — 삼키면 안 켜진 모드가 켜진 것처럼 보인다', () => {
    const r = run(FORM, ['--cases', 'x.tsv', '--oracle']);
    expect(r.exitCode).toBe(3);
    expect(r.stderr).toMatch(/모르는 플래그/);
  });
});

describe('⭐ --json 계약 — 돈 이상 stdout 은 항상 유효 JSON 이다', () => {
  const dir = tmp();
  const pre = okPre(dir);
  const paths: Array<{ name: string; args: string[]; expect: number }> = [
    {
      name: '끝났다',
      args: ['--cases', write(dir, 'a.tsv', `${HEAD}\nTC-1${TAB}policy${TAB}failed${TAB}star${TAB}fixed${TAB}고쳤다\n`), '--preconditions', pre],
      expect: 0,
    },
    {
      name: '판단 안 한 fail',
      args: ['--cases', write(dir, 'b.tsv', `${HEAD}\nTC-1${TAB}policy${TAB}failed${TAB}star${TAB}${TAB}\n`), '--preconditions', pre],
      expect: 1,
    },
    { name: '대상 없음', args: [], expect: 3 },
    { name: '파일 없음', args: ['--cases', join(dir, '없다.tsv')], expect: 3 },
    {
      name: '양식이 나쁘다',
      args: ['--cases', write(dir, 'c.tsv', `${HEAD}\nTC-1${TAB}polciy${TAB}failed${TAB}star${TAB}${TAB}\n`), '--preconditions', pre],
      expect: 3,
    },
    { name: '모르는 플래그', args: ['--oracle'], expect: 3 },
  ];

  for (const path of paths) {
    it(`${path.name} → exit ${path.expect} 이고 stdout 이 유효 JSON`, () => {
      const r = run(FORM, ['--json', ...path.args]);
      expect(r.exitCode).toBe(path.expect);
      const parsed = JSON.parse(r.stdout) as { tool: string; exitCode: number };
      expect(parsed.tool).toBe('tc-form');
      expect(parsed.exitCode).toBe(path.expect);
    });
  }
});

describe('tc-form --emit — 양식을 내준다', () => {
  it('두 벌을 내주고, **이미 있으면 덮어쓰지 않는다**', () => {
    const dir = join(tmp(), '양식');
    expect(run(FORM, ['--emit', dir]).exitCode).toBe(0);
    expect(existsSync(join(dir, 'tc-cases.tsv'))).toBe(true);
    expect(existsSync(join(dir, 'tc-preconditions.tsv'))).toBe(true);
    const again = run(FORM, ['--emit', dir]);
    expect(again.exitCode).toBe(3);
    expect(again.stderr).toMatch(/덮어쓰지 않는다/);
  });

  it('내준 빈 양식을 그대로 넣으면 **못 쟀다(3)** 다 — 빈 표가 초록이 되지 않는다', () => {
    const dir = join(tmp(), '양식2');
    run(FORM, ['--emit', dir]);
    const r = run(FORM, [
      '--cases', join(dir, 'tc-cases.tsv'),
      '--preconditions', join(dir, 'tc-preconditions.tsv'),
    ]);
    expect(r.exitCode).toBe(3);
  });
});

describe('⛔⛔ tc-draft — 기본은 **모델 호출 0회**', () => {
  /** PATH 를 갈아 끼운 가짜 `claude` — 불리면 파일에 줄을 남긴다. 화면 문구를 안 믿는다. */
  const fakeClaude = (): { path: string; calls: () => number } => {
    const dir = tmp();
    const bin = join(dir, 'bin');
    mkdirSync(bin, { recursive: true });
    const marker = join(dir, 'calls.txt');
    writeFileSync(
      join(bin, 'claude'),
      `#!/usr/bin/env bash\ncat > /dev/null\necho called >> ${marker}\nprintf '{"result":"[]","is_error":false}'\n`,
      'utf8',
    );
    chmodSync(join(bin, 'claude'), 0o755);
    return {
      path: bin,
      calls: () => (existsSync(marker) ? readFileSync(marker, 'utf8').trim().split('\n').length : 0),
    };
  };

  const policy = (dir: string): string =>
    write(dir, 'policy.md', '# 로그인 잠금\n5회 실패하면 10분간 잠근다\n\n# 문구\n잠긴 동안 안내 문구를 보여 준다\n');

  it('--write 없이는 모델을 **한 번도** 안 부른다 (가짜 claude 로 세서 잰다)', () => {
    const dir = tmp();
    const fake = fakeClaude();
    const r = run(DRAFT, ['--policy', policy(dir)], { PATH: `${fake.path}:${process.env.PATH ?? ''}` });
    expect(r.exitCode).toBe(0);
    expect(fake.calls()).toBe(0);
    expect(r.stdout).toMatch(/모델을 2번/);
  });

  it('--json 도 모델 호출 0회이고 **몇 번 부를지**를 수로 말한다', () => {
    const dir = tmp();
    const fake = fakeClaude();
    const r = run(DRAFT, ['--json', '--policy', policy(dir)], { PATH: `${fake.path}:${process.env.PATH ?? ''}` });
    const parsed = JSON.parse(r.stdout) as { modelCalls: number; wouldCall: number };
    expect(parsed.modelCalls).toBe(0);
    expect(parsed.wouldCall).toBe(2);
    expect(fake.calls()).toBe(0);
  });

  it('정책 조각이 0개면 3 — 「TC 로 만들 것이 없다」가 아니라 못 쟀다', () => {
    const dir = tmp();
    const r = run(DRAFT, ['--policy', write(dir, 'empty.md', '\n\n')]);
    expect(r.exitCode).toBe(3);
    expect(r.stderr).toMatch(/0개/);
  });

  it('--write 를 줬는데 --out 이 없으면 부르기 전에 죽는다 — 돈부터 쓰지 않는다', () => {
    const dir = tmp();
    const fake = fakeClaude();
    const r = run(DRAFT, ['--policy', policy(dir), '--write'], {
      PATH: `${fake.path}:${process.env.PATH ?? ''}`,
    });
    expect(r.exitCode).toBe(3);
    expect(fake.calls()).toBe(0);
  });

  it('⛔ 모르는 플래그를 거부한다', () => {
    const r = run(DRAFT, ['--policy', 'x.md', '--oracle']);
    expect(r.exitCode).toBe(3);
    expect(r.stderr).toMatch(/모르는 플래그/);
  });
});
