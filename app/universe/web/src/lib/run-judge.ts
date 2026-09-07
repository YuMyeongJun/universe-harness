import type {
  Attribution,
  CaseOrigin,
  IRunCase,
  IRunPayload,
  VerdictKind,
} from '@api/types';
import type { BannerTone, PillTone } from '@components/ui';

/**
 * **주행 결과를 화면이 어떻게 읽는가.**
 *
 * ⛔⛔ **여기서 다시 세지 않는다.** 무엇이 판단이고(사유 30자) 무엇이 검증 분모에 드는지는
 * `qa/src/run/contract.ts` 가 정하고 `tc-run` 이 센다. 화면이 같은 셈을 한 벌 더 가지면
 * 언젠가 갈리고, 갈린 뒤에는 **어느 쪽이 사실인지 아무도 모른다**(`BlankCounter` 와 같은 규율).
 *
 * ⚠️ 그래서 이 파일이 하는 일은 셋뿐이다:
 *   1. **모양을 본다** — 모르는 모양이면 ⚪ 로 물러난다(`readRunPayload`). 그럴듯하게 그리지 않는다.
 *   2. **갈라 그린다** — 판단 안 된 fail · 판단된 fail · ⚪ 못 잰 것 · **자기 채점** · 검증된 통과.
 *   3. **대조한다**(`disagreements`) — 도구가 「끝났다」는데 화면에 보이는 fail 에 판단이 없으면
 *      **끝났다고 말하지 않는다.** 화면이 도구를 무조건 믿으면, 도구가 무르는 날 화면도 함께 무른다.
 */

/** `tc-run` 의 종료 코드. ⛔ 숫자를 그대로 흩뿌리지 않는다 — 3은 「못 쟀다」지 실패가 아니다. */
export const EXIT_DONE = 0;
export const EXIT_UNJUDGED = 1;
export const EXIT_UNMEASURED = 3;

/** 사람이 손으로 다시 칠 수 있는 명령. ⛔ 화면이 못 받아도 **사람은 볼 수 있어야 한다.** */
export const RUN_BY_HAND = 'npx tsx qa/src/run/cli.ts <주행결과.json> --json';

/* ── 1. 모양을 본다 ─────────────────────────────────────────────────────── */

export interface IRunRead {
  /** `null` 이면 못 읽었다 — ⛔ 그때는 화면이 아무 목록도 그리지 않는다. */
  payload: IRunPayload | null;
  /** 왜 못 읽었는가. `null` 이면 읽었다. */
  refused: string | null;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/**
 * 받은 JSON 이 **주행 결과의 모양인가.**
 *
 * ⛔ 모르는 모양을 「빈 주행」으로 접지 않는다. 빈 주행은 화면에서 **아무 fail 도 없는 것**으로
 * 보이고, 그건 이 화면이 막으려는 바로 그 사고다. 모르면 ⚪ 로 물러나고 이유를 적는다.
 */
export const readRunPayload = (raw: unknown): IRunRead => {
  /** ⛔ 이름이 짧으면 다음 사람이 「무엇을 안 한다는 것인지」를 못 읽는다. */
  const cannotRead = (why: string): IRunRead => ({ payload: null, refused: why });
  if (!isObject(raw)) { return cannotRead('JSON 이 객체가 아니다 — 주행 결과 모양이 아니다.'); }
  if (raw['tool'] !== 'tc-run') {
    return cannotRead(`\`tool\` 이 "tc-run" 이 아니다: ${JSON.stringify(raw['tool'])} — 다른 도구의 출력이다.`);
  }
  if (!Array.isArray(raw['cases']) || !Array.isArray(raw['preconditions'])) {
    return cannotRead('`cases[]` 또는 `preconditions[]` 가 없다. ⛔ 전제가 없는 주행은 잰 것이 아니다.');
  }
  if (typeof raw['measurable'] !== 'boolean') {
    return cannotRead('`measurable` 이 없다 — 전제가 섰는지 모르는 결과는 ❌ 로도 ✅ 로도 못 읽는다.');
  }
  if (!isObject(raw['stats']) || !isObject(raw['verification'])) {
    return cannotRead('`stats` 또는 `verification` 이 없다. ⛔ 분모 없는 건수는 뜻이 없다.');
  }
  const done = raw['done'];
  if (!isObject(done) || typeof done['done'] !== 'boolean' || !Array.isArray(done['unjudged'])) {
    return cannotRead(
      '`done` 이 없거나 모양이 다르다 — **종료 조건을 모르는 결과다.** ' +
        '`tc-run … --json` 의 출력을 그대로 붙여 넣어라(요약본 말고).',
    );
  }
  return { payload: raw as unknown as IRunPayload, refused: null };
};

/* ── 2. 갈라 그린다 ─────────────────────────────────────────────────────── */

/**
 * 케이스 한 건이 **어느 무더기에 속하는가.**
 *
 * ⛔ `unjudged` 를 맨 앞에 두는 이유: 사람이 볼 것은 「fail 목록」이 아니라
 * **「아직 판단하지 않은 것」**이다. 그것이 이 루프의 종료 조건이다.
 */
export type CaseBucket = 'unjudged' | 'judged-fail' | 'unmeasured' | 'self-scoring' | 'verified-pass';

export const bucketOf = (
  runCase: IRunCase,
  measurable: boolean,
  unjudgedIds: ReadonlySet<string>,
): CaseBucket => {
  /* ⛔⛔ 전제가 안 서면 **무조건 ⚪ 다.** 도구가 접어서 주지만 화면도 접는다 —
     로그인 페이지를 재고 뱉은 「전부 fail」을 목록에 올리면 사람이 엉뚱한 데를 판다. */
  if (!measurable || runCase.status === 'unmeasured') { return 'unmeasured'; }
  if (runCase.status === 'failed') {
    /* 도구가 부른 이름이 먼저고, 도구가 못 본 것(`verdict === null`)은 화면이 잡는다. */
    if (unjudgedIds.has(runCase.id) || runCase.verdict === null) { return 'unjudged'; }
    return 'judged-fail';
  }
  /* 통과인데 검증 분모 밖 = **자기 채점.** ⛔ 초록 무더기에 섞지 않는다. */
  if (!runCase.countsAsVerification) { return 'self-scoring'; }
  return 'verified-pass';
};

export interface ICaseMark {
  /** 관측소 터미널과 **같은 표**를 쓴다 — 두 화면이 다른 기호를 쓰면 대조가 안 된다. */
  mark: string;
  label: string;
  tone: PillTone;
  /** ⛔ 표만 두지 않는다. **왜 그렇게 그렸는지**가 늘 따라다닌다. */
  why: string;
}

/**
 * 케이스의 상태를 그린다.
 *
 * ⛔⛔ **전제가 안 서면 ❌ 를 그리지 않는다.** 실측(다른 팀): 로그인 세션이 루프 중간에
 * 죽어 화면은 로그인 페이지를 재고 「전부 fail」을 뱉었다 — 제품 결함이 아닌데도.
 */
export const judgeCaseStatus = (runCase: IRunCase, measurable: boolean): ICaseMark => {
  if (!measurable) {
    return {
      mark: '⚪',
      label: '못 쟀다 — 전제가 안 섰다',
      tone: 'unknown',
      why:
        `전제가 서지 않은 주행이다. 도구가 적어 온 원래 상태는 ${JSON.stringify(
          runCase.foldedFrom ?? runCase.status,
        )} 지만, ` + '⛔ 그것은 제품 신호가 아니다 — ❌ 로 세면 없는 버그를 찾으러 간다.',
    };
  }
  switch (runCase.status) {
    case 'passed':
      return {
        mark: '✅',
        label: '통과',
        tone: 'ok',
        why: '이 주행에서 통과했다. ⛔ 출처가 구현이면 통과해도 아무것도 검증하지 않는다(아래 출처를 보라).',
      };
    case 'failed':
      return { mark: '❌', label: '실패', tone: 'bad', why: '이 주행에서 실패했다 — 판단이 필요하다.' };
    case 'unmeasured':
      return {
        mark: '⚪',
        label: '못 쟀다',
        tone: 'unknown',
        why: runCase.unmeasuredReason ?? '도구가 이 케이스를 ⚪ 로 접었다 — 통과도 실패도 아니다.',
      };
    default:
      /* ⛔ 모르는 상태를 초록으로 접지 않는다 — 계약이 갈래를 늘리면 여기서 ⚪ 로 보인다. */
      return {
        mark: '⚪',
        label: '모르는 상태',
        tone: 'unknown',
        why: `도구가 준 \`status\` 를 화면이 모른다: ${JSON.stringify(runCase.status)}.`,
      };
  }
};

/**
 * 출처 — ⛔ **`derived-from-code` 를 「검증됨」으로 세지 않는다.**
 * 구현을 읽고 쓴 TC 는 구현이 하는 일을 적은 것이라 **정의상 통과**한다. 자기 채점이다.
 */
export const judgeOrigin = (origin: CaseOrigin): ICaseMark => {
  switch (origin) {
    case 'policy':
      return { mark: 'ⓘ', label: '출처: 정책서', tone: 'auto', why: '사람이 만든 기준에서 나온 TC 다 — 검증 분모에 든다.' };
    case 'human':
      return { mark: 'ⓘ', label: '출처: 사람', tone: 'auto', why: '사람이 적은 TC 다 — 검증 분모에 든다.' };
    case 'derived-from-code':
      return {
        mark: '⛔',
        label: '자기 채점 — 구현에서 뽑은 TC',
        tone: 'bad',
        why:
          '구현을 읽고 쓴 TC 라 **정의상 통과**한다. 아무것도 검증하지 않는다 ⇒ 검증 분모 밖이다. ' +
          '⛔ 이것을 초록으로 세면 「다 통과했다」가 자기 채점의 다른 말이 된다.',
      };
    case 'unknown':
      return {
        mark: '⚪',
        label: '출처 미상',
        tone: 'unknown',
        why:
          '어디서 나온 TC 인지 못 밝혔다 — 계약은 이것을 구현 유래와 **같은 취급**으로 두어 검증 분모에서 뺀다. ' +
          '⛔ 목록에서 빼지는 않는다: 빼면 분모를 잃는다.',
      };
    default:
      return {
        mark: '⚪',
        label: '모르는 출처',
        tone: 'unknown',
        why: `도구가 준 \`origin\` 을 화면이 모른다: ${JSON.stringify(origin)} — 검증됨으로 읽지 마라.`,
      };
  }
};

/** 누구 탓인가. ⛔ 안 가르면 자동 수정이 **환경 탓을 코드에서** 고치려 든다. */
export const judgeAttribution = (attribution: Attribution): ICaseMark => {
  switch (attribution) {
    case 'star':
      return { mark: 'ⓘ', label: '탓: 별(화면/컴포넌트)', tone: 'auto', why: '별 안의 코드가 원인이다 — 자동 수정이 겨눌 수 있다.' };
    case 'galaxy':
      return { mark: 'ⓘ', label: '탓: 은하(저장소 전체)', tone: 'auto', why: '별 하나가 아니라 저장소 쪽 원인이다.' };
    case 'environment':
      return {
        mark: '⚠️',
        label: '탓: 환경',
        tone: 'warn',
        why: '제품 코드가 아니라 환경이 원인이다 — ⛔ 코드를 고쳐서는 안 없어진다.',
      };
    case 'unknown':
      return {
        mark: '⚪',
        label: '탓을 못 갈랐다',
        tone: 'unknown',
        why: '별 탓인지 환경 탓인지 모른다 — ⛔ 자동 수정이 **못 고치는 것을 고치려 든다.** 사람이 먼저 갈라야 한다.',
      };
    default:
      return {
        mark: '⚪',
        label: '모르는 탓',
        tone: 'unknown',
        why: `도구가 준 \`attribution\` 을 화면이 모른다: ${JSON.stringify(attribution)}.`,
      };
  }
};

/** 판단 셋. ⛔ 넷째 갈래(「무시」)는 **만들지 않았다** — 넘길 수 있는 관문은 넘겨진다. */
export const judgeVerdictKind = (kind: VerdictKind): ICaseMark => {
  switch (kind) {
    case 'fixed':
      return { mark: '🛠', label: '고쳤다', tone: 'ok', why: '구현을 고쳤다 — 행위가 증거다. 다음 주행이 다시 잰다.' };
    case 'test-wrong':
      return { mark: '🧪', label: '테스트가 틀렸다', tone: 'warn', why: 'TC 쪽이 틀렸다고 판단했다. ⚠️ 단언을 무르게 한 것과 구별되는 자리다 — 사유를 읽어라.' };
    case 'accepted':
      return {
        mark: '📌',
        label: '받아들인다',
        tone: 'warn',
        why: '고치지 않고 받아들였다. ⛔ 사유가 짧으면 판단이 아니라 **치운 것**이고, 그 판정은 도구가 한다.',
      };
    default:
      return {
        mark: '⚪',
        label: '모르는 판단',
        tone: 'unknown',
        why: `화면이 모르는 판단 종류다: ${JSON.stringify(kind)} — 판단으로 읽지 마라.`,
      };
  }
};

/* ── 3. 대조한다 ────────────────────────────────────────────────────────── */

/**
 * **도구가 한 말과 화면에 보이는 것이 어긋나는가.**
 *
 * ⛔⛔ 화면이 도구를 무조건 믿으면, 도구가 무르는 날 화면도 함께 무른다. 여기서 잡는 것은
 * 화면이 **다시 세지 않고도 볼 수 있는 것**뿐이다 — 셈을 베끼는 것이 아니다.
 * 한 줄이라도 나오면 화면은 **「끝났다」고 말하지 않는다.**
 */
export const disagreements = (payload: IRunPayload): string[] => {
  const found: string[] = [];
  const named = new Set(payload.done.unjudged.map((u) => u.id));

  for (const runCase of payload.cases) {
    if (payload.measurable && runCase.status === 'failed' && runCase.verdict === null && !named.has(runCase.id)) {
      found.push(
        `${runCase.id} 은 fail 인데 판단(\`verdict\`)이 없다 — 그런데 도구의 「판단하지 않은 것」 목록에는 없다.`,
      );
    }
    if (!payload.measurable && runCase.status === 'failed') {
      found.push(
        `전제가 안 섰는데 ${runCase.id} 이 ❌ 로 왔다 — 화면은 ⚪ 로 그렸다. 도구가 접지 않았다는 뜻이다.`,
      );
    }
  }
  if (payload.done.done && payload.done.unjudged.length > 0) {
    found.push(
      `도구가 「끝났다」면서 판단하지 않은 것을 ${payload.done.unjudged.length}건 함께 적었다 — 둘 다 참일 수 없다.`,
    );
  }
  if (payload.done.done && !payload.measurable) {
    found.push('전제가 안 선 주행인데 도구가 「끝났다」고 했다 — 못 잰 것은 끝난 것이 아니다.');
  }
  if (payload.done.done && payload.verification.denominator === 0) {
    found.push('검증 분모가 0인데 「끝났다」고 했다 — 아무것도 검증하지 않은 주행이다.');
  }
  return found;
};

export interface IDoneBanner {
  mark: string;
  tone: BannerTone;
  /** 화면 맨 위에 **가장 크게** 적히는 한 줄. */
  headline: string;
  /** 도구의 문장 그대로 — ⛔ 고쳐 적지 않는다. */
  toolSaid: string;
}

/**
 * 화면 맨 위 — **종료 조건.**
 *
 * ⛔⛔ 종료 조건은 「fail 0」이 **아니다.** 그렇게 두면 가장 싼 해법이 단언을 무르게 하는 것이
 * 된다 — 셀렉터를 넓히거나 spec 을 빼면 초록이다. 조건은 **「판단하지 않은 fail 0」**이다.
 */
export const judgeDone = (payload: IRunPayload, conflicts: string[]): IDoneBanner => {
  const toolSaid = payload.done.reason;
  if (conflicts.length > 0) {
    return {
      mark: '⛔',
      tone: 'bad',
      headline: `도구의 셈과 화면이 본 것이 다르다 — ${conflicts.length}곳. 「끝났다」고 말하지 않는다.`,
      toolSaid,
    };
  }
  if (!payload.measurable || payload.verification.denominator === 0) {
    return {
      mark: '⚪',
      tone: 'unknown',
      headline: '못 쟀다 — 이 주행은 제품 신호가 아니다. ⛔ 실패도 통과도 아니다.',
      toolSaid,
    };
  }
  const waiting = payload.done.unjudged.length;
  if (waiting > 0) {
    return {
      mark: '⛔',
      tone: 'bad',
      headline: `판단하지 않은 것 ${waiting}건 — 이것이 0이 될 때까지 이 루프는 안 끝난다.`,
      toolSaid,
    };
  }
  if (!payload.done.done) {
    return {
      mark: '⚪',
      tone: 'unknown',
      headline: '도구가 「끝났다」고 하지 않았다 — 화면도 그렇게 말하지 않는다.',
      toolSaid,
    };
  }
  return {
    mark: '✅',
    tone: 'ok',
    headline: `판단하지 않은 것 0건 / 검증 분모 ${payload.verification.denominator}건 — 이 주행은 끝났다.`,
    toolSaid,
  };
};
