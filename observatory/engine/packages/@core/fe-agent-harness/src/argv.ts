/**
 * 인자 파서 — **코어에 있다.**
 *
 * ⚠️ 한때 두 플러그인에 **같은 구현이 복제**돼 있었다. 「플러그인끼리 의존하지 않는다」는
 * 규칙 때문이었고, Next 플러그인을 만든 갈래가 그 자리에 「코어로 올리는 것이 맞다」고
 * 적어 뒀는데 **한동안 안 올렸다.**
 * export 이름 충돌을 세다가 다시 드러났다 — `parseArgv` · `VALUE_FLAGS` · `IParsedArgv` 가
 * 두 곳에서 나왔다. **복제는 이름 충돌로 먼저 보인다.**
 *
 * ⚠️ 실측(2026-09-04): `"harness": "node cli.ts --config <경로>"` 처럼 스크립트에 플래그를
 *    박아 두면 `yarn harness list` 의 argv 는 `['--config', '<경로>', 'list']` 가 된다.
 *    위치 인자를 `argv[0]` 으로 읽으면 **플래그를 명령으로 착각한다.** 그래서 값을 받는
 *    플래그 목록을 알고 건너뛴다.
 */
export interface IParsedArgv {
  positionals: string[];
  flags: Record<string, string>;
  booleans: Set<string>;
}

/** 값을 하나 먹는 플래그. 여기 없는 `--x` 는 boolean 으로 본다. */
export const VALUE_FLAGS = [
  '--repo-root',
  '--config',
  '--agent-model',
  '--contract-model',
  '--model',
  '--sample',
  '--rule',
  '--stage',
  '--base',
];

/** 값을 안 먹는 플래그. **이 목록에 없는 `--x` 는 오타로 보고 거부한다.** */
export const BOOLEAN_FLAGS = ['--dry-run', '--force', '--keep', '--linked', '--shell', '--static-only', '--help'];

/**
 * ⚠️⚠️ **모르는 플래그를 조용히 삼키지 않는다.**
 *
 * 실측(2026-09-04): 존재하지도 않는 `--oracle` 을 붙여 「LLM 을 안 쓰는 모드」인 줄 알고
 * 돌렸는데, 파서가 그것을 boolean 으로 삼키고 **평범한 LLM 에피소드가 돌았다.**
 * 비용 기록을 붙이고서야 드러났다 — `LLM 호출 6회 · $0.2072`.
 * 공짜인 줄 알고 돈을 쓰는 구조였다. 모르는 플래그는 **오타이거나 착각**이므로 거부한다.
 */
export const parseArgv = (
  argv: string[],
  valueFlags: string[] = VALUE_FLAGS,
  booleanFlags: string[] | null = BOOLEAN_FLAGS,
): IParsedArgv => {
  const positionals: string[] = [];
  const flags: Record<string, string> = {};
  const booleans = new Set<string>();

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      positionals.push(token);
      continue;
    }
    if (valueFlags.includes(token)) {
      flags[token] = argv[index + 1] ?? '';
      index += 1;
      continue;
    }
    if (booleanFlags && !booleanFlags.includes(token)) {
      const known = [...valueFlags, ...booleanFlags].sort().join(' ');
      throw new Error(`모르는 플래그: ${token}\n아는 플래그는 이것뿐이다: ${known}`);
    }
    booleans.add(token);
  }

  return { positionals, flags, booleans };
};
