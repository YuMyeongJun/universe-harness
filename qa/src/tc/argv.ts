/**
 * **모르는 플래그를 거부한다** — 관측 법칙 §7 을 `qa/` 안에서 지키는 자리.
 *
 * ⚠️ 왜 `lib/flags.mjs` 를 안 쓰나: `qa/` 는 **따로 배달되는 패키지**다(`tc-lint` 등이 남의
 * 저장소에서 돈다). 우주의 `lib/` 는 거기 안 간다. ⛔ 그래서 여기 있는 것은 복제가 아니라
 * **경계**다 — 같은 규율을 두 패키지가 각자 지킨다.
 *
 * ⚠️ 왜 거부가 필요한가: 없는 플래그를 파서가 조용히 삼키면 **안 켜진 모드가 켜진 것처럼
 * 보인다.** 이 저장소는 그것으로 「모델 안 부르는 모드」인 줄 알고 유료 주행을 돌린 적이 있다.
 *
 * ⛔ 값은 플래그가 아니다: `--to '--json'` 처럼 `--` 로 시작하는 **값**을 모르는 플래그로
 * 읽으면 진짜 값을 못 준다. 그래서 「값을 받는 플래그」를 알고 그 다음 토큰을 건너뛴다.
 */

export interface IFlagSpec {
  /** 값을 안 받는 플래그. */
  boolean: readonly string[];
  /** 값을 받는 플래그 — 다음 토큰은 값이다. */
  value: readonly string[];
}

export interface IArgv {
  /** 모르는 플래그들. 비어 있지 않으면 **거부해야 한다.** */
  unknown: string[];
  /** 플래그가 안 먹은 토큰 — 위치 인자. */
  positional: string[];
  has: (name: string) => boolean;
  /** `--name 값` 과 `--name=값` 둘 다 읽는다. */
  get: (name: string) => string | undefined;
}

export const parseArgv = (argv: readonly string[], spec: IFlagSpec): IArgv => {
  const known = new Set([...spec.boolean, ...spec.value]);
  const unknown: string[] = [];
  const positional: string[] = [];
  const values = new Map<string, string>();
  const present = new Set<string>();

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i] as string;
    if (!token.startsWith('--')) {
      positional.push(token);
      continue;
    }
    /* `--name=값` 은 한 토큰에 이름과 값이 같이 온다. ⛔ 값 안의 `=` 는 값의 일부다
       (`--run "a=1 b=2"`) — 첫 `=` 에서만 가른다. */
    const at = token.indexOf('=');
    const askedFlag = at === -1 ? token : token.slice(0, at);
    const valueInToken = at === -1 ? undefined : token.slice(at + 1);
    if (!known.has(askedFlag)) {
      unknown.push(askedFlag);
      continue;
    }
    present.add(askedFlag);
    if (!spec.value.includes(askedFlag)) continue;
    if (valueInToken !== undefined) {
      values.set(askedFlag, valueInToken);
      continue;
    }
    const next = argv[i + 1];
    if (next !== undefined) {
      values.set(askedFlag, next);
      i += 1;
    }
  }

  return {
    unknown,
    positional,
    has: (name) => present.has(name),
    get: (name) => values.get(name),
  };
};

/** 거부 사유 문구 — 아는 플래그를 **전부** 보여 준다(사람이 다음에 뭘 칠지 알게). */
export const unknownFlagMessage = (unknown: string[], spec: IFlagSpec, command: string): string =>
  `⛔ ${command}: 모르는 플래그 ${unknown.join(' ')}\n` +
  `   아는 플래그는 이것뿐이다: ${[...spec.boolean, ...spec.value].sort().join(' ')}\n` +
  '   (관측 법칙 §7 — 모르는 입력을 삼키면 안 켜진 모드가 켜진 것처럼 보인다)';
