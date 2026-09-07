/**
 * 「사람이 내린 **판정을 받아 두고, 다시 재게 한다**」 — 콘솔의 서버 쪽.
 *
 * ⛔⛔ **여기서 판정을 만들지 않는다.** 「사유가 짧으면 판단이 아니다」·「`verdict === null`
 *    이면 안 끝났다」·「모르는 종류는 판단이 아니다」는 전부 `qa/src/run` 의 계약이 이미 아는
 *    일이다(`validateVerdict` · `evaluateDone`). 서버가 그것을 다시 구현하면 **두 자리가
 *    조용히 갈린다** — 화면은 「판정 3건 붙였다」인데 관문은 「판단하지 않은 fail 3건」인
 *    상태가 생긴다(R47·R91 이 반복해서 잡은 자리).
 *    ⇒ 이 파일이 하는 일은 셋뿐이다: **적어 둔다 · 붙여서 넘긴다 · 다시 물어본다.**
 *    「끝났는가」의 답은 언제나 `qa/dist/run/cli.js` 가 낸 것을 그대로 나른다.
 *
 * 이 파일이 지키는 것:
 *
 *  1. **판정에 「누가·언제」를 같이 남긴다.** 옆 저장소 세션의 실측: 사람이 「확인함」을
 *     눌렀는데 **누가 언제 눌렀는지 안 남아서**, 나중에 그것이 **미도달 화면**이었다는 걸
 *     아무도 못 짚었다. 판정만 있고 서명이 없으면 되짚을 자리가 없다.
 *  2. ⛔ **화면이 보낸 「누가」를 믿지 않는다.** 위조된다. `by` 에는 **서버가 아는 것만**
 *     적는다(프로세스 사용자 · 서버 시계). 못 읽으면 `null` 로 두고 **모른다고 적는다** —
 *     지어내지 않는다. 화면이 보낸 이름은 `untrustedClientClaim` 에 **증거로만** 남긴다.
 *  3. **덮어쓰기·지우기도 기록이다.** 장부는 **덧붙이기만 한다**(append-only).
 *     「고쳤다」를 「받아들인다」로 바꾼 것은 **판단이 바뀐 것**이지 없던 일이 되는 게 아니다.
 *     지운 것도 `verdict: null` 항목으로 남는다.
 *  4. ⛔ **일괄 갈래를 만들지 않는다.** 한 번에 한 케이스다. 목록을 받으면 거절한다 —
 *     「전부 통과 처리」 버튼 하나면 이 콘솔의 존재 이유가 사라진다.
 *  5. **저장은 `.data/`(gitignore) 안에만.** 이 저장소는 공개 MIT 이고, 주행 본문과 판정
 *     사유에는 회사 이름 · 내부 URL · 계정이 섞여 온다. 실측:
 *       `git check-ignore -v app/universe/.data/run-judgments/x` → `app/universe/.gitignore:4:.data/`
 *  6. ⛔ **4xx 를 결과에 쓰지 않는다.** 「사유가 짧다」·「전제가 안 섰다」는 **결과**다 —
 *     저장은 되고, 세지 않는 것은 계약이 정한다. 400 은 **요청의 모양**이 틀렸을 때뿐이고,
 *     404 는 **없는 것을 가리켰을 때**뿐이다(없는 주행 · 없는 케이스).
 *     ⚠️ 특히 **짧은 사유를 저장에서 막지 않는다.** 사람이 쓰던 중일 수 있다.
 *     막으면 사람은 「30자 채우기」를 하게 되고, 그건 판단이 아니라 자릿수다.
 */
import { randomBytes } from 'node:crypto';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { userInfo } from 'node:os';
import { join } from 'node:path';

import { dataDir } from './paths.js';
import { receiveRunResult, type IRunReceipt, type RunShape } from './run-result.js';

/**
 * 주행과 판정이 앉는 자리 — **`.data/` 안**이다.
 * ⛔ `.data/runs/` 는 `run-result.ts` 가 도구에 넘길 **임시 본문**을 쓰고 지우는 자리라
 *    섞지 않는다. 여기는 **남는** 자리다.
 */
export const storeDir = (): string => join(dataDir(), 'run-judgments');
const runDir = (id: string): string => join(storeDir(), id);

/** 주행 id — **서버가 만든다.** 사람이 준 이름이 경로가 되는 자리를 만들지 않는다(R76). */
const ID_SHAPE = /^[0-9a-f]{16}$/;
export const runIdProblem = (id: string): string | null =>
  ID_SHAPE.test(id) ? null : '주행 id 가 올바르지 않습니다.';

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * 누가 했나 — ⛔ **서버가 아는 것만.**
 *
 * 화면이 보낸 이름은 여기 절대 안 들어온다. 프로세스 사용자조차 못 읽는 환경이 있어서
 * (`os.userInfo` 는 uid 에 해당하는 계정이 없으면 던진다 — 컨테이너에서 흔하다)
 * 그때는 `user: null` 이고 `how` 가 **모른다고 말한다.** 지어내지 않는다.
 */
export interface IActor {
  /** 프로세스 사용자 이름. `null` 은 **모른다**이지 「아무도 아니다」가 아니다. */
  user: string | null;
  uid: number | null;
  pid: number;
  /** 이 값을 **어떻게 알았나.** 화면이 말한 것이 아니라는 표시이기도 하다. */
  how: string;
}

const actorNow = (): IActor => {
  try {
    const info = userInfo();
    return {
      user: info.username,
      uid: typeof info.uid === 'number' && info.uid >= 0 ? info.uid : null,
      pid: process.pid,
      how: '서버 프로세스 사용자(os.userInfo) — 화면이 보낸 이름이 아니다',
    };
  } catch (e) {
    return {
      user: null,
      uid: null,
      pid: process.pid,
      /* ⛔ 여기서 'unknown' 같은 그럴듯한 문자열을 넣지 않는다. 모르는 것은 null 이다. */
      how: `서버가 프로세스 사용자를 못 읽었다 — **모른다**: ${(e as Error).message}`,
    };
  }
};

/** 계약의 판정 모양. ⛔ 서버는 이 값을 **검사하지 않는다** — 모양만 본다. */
export interface IVerdictInput {
  kind: string;
  why: string;
}

/** 장부 한 줄. ⛔ 고쳐 쓰지 않는다 — 덧붙이기만 한다. */
export interface ILedgerEntry {
  seq: number;
  /** 서버 시계. 화면이 보낸 시각이 아니다. */
  at: string;
  by: IActor;
  caseId: string;
  /** `null` = **판정을 지웠다.** 「없던 일」이 아니라 「지웠다는 판단」이다. */
  verdict: IVerdictInput | null;
  /** 직전에 붙어 있던 판정. 덮어쓴 것을 되짚는 자리다. */
  replaced: IVerdictInput | null;
  /** 직전에 판정이 **있었는가.** 「없던 것을 지웠다」와 「있던 것을 지웠다」는 다르다. */
  hadPrevious: boolean;
  /**
   * ⛔ 화면이 스스로 밝힌 「누가」. **믿지 않는다** — `by` 에 쓰지 않고 여기에만 남긴다.
   * 위조가 가능하다는 것을 이름으로 못 박아 둔다.
   */
  untrustedClientClaim?: unknown;
}

export interface IRunMeta {
  id: string;
  receivedAt: string;
  receivedBy: IActor;
  /** 처음 받았을 때 서버가 고른 경로. 다시 잴 때의 모양과 다를 수 있다(아래 `remeasured`). */
  receivedShape: RunShape;
  from: string | null;
}

const metaPath = (id: string): string => join(runDir(id), 'meta.json');
const rawPath = (id: string): string => join(runDir(id), 'raw.json');
const inputPath = (id: string): string => join(runDir(id), 'input.json');
const ledgerPath = (id: string): string => join(runDir(id), 'ledger.jsonl');

/**
 * 도구의 보고서에서 **입력을 되살린다** — 판정을 붙여 다시 재려면 계약 모양의 입력이 필요하다.
 *
 * ⚠️ 왜 원문을 그대로 못 쓰나: Playwright 리포트에는 `verdict` 를 적을 칸이 **없다.**
 *    사람의 판정을 붙일 자리가 원문에 없으니, 계약이 이미 옮겨 놓은 케이스 목록에 붙인다.
 * ⛔ **여기서 접거나 세지 않는다.** 계약이 넣은 파생 칸(`countsAsVerification` · `foldedFrom`)만
 *    걷어내서 **입력이었던 모양으로** 되돌린다. 접는 것은 다시 잴 때 계약이 다시 한다 —
 *    전제(`preconditions`)를 그대로 싣기 때문에 **같은 자리에서 같게 접힌다.**
 */
const inputFromReport = (report: unknown): Record<string, unknown> | null => {
  if (!isRecord(report)) return null;
  const pres = report['preconditions'];
  const cases = report['cases'];
  if (!Array.isArray(pres) || !Array.isArray(cases)) return null;
  return {
    preconditions: pres,
    cases: cases.map((c) => {
      if (!isRecord(c)) return c;
      const { countsAsVerification: _cav, foldedFrom, ...rest } = c;
      /* 접히기 전 상태로 되돌린다 — 안 그러면 다음 판에서 「⚪ 를 ⚪ 로 접었다」가 된다. */
      return typeof foldedFrom === 'string' ? { ...rest, status: foldedFrom } : rest;
    }),
  };
};

/** 케이스 id 목록 — 없는 케이스에 판정을 다는 것을 **거절**하려고 본다. */
const caseIdsOf = (input: Record<string, unknown> | null): string[] => {
  if (input === null || !Array.isArray(input['cases'])) return [];
  return input['cases']
    .map((c) => (isRecord(c) && typeof c['id'] === 'string' ? c['id'] : null))
    .filter((v): v is string => v !== null);
};

/** 장부를 읽는다. ⛔ **못 읽은 줄을 조용히 버리지 않는다** — 버리면 판정이 사라진 줄 모른다. */
const readLedger = (id: string): { entries: ILedgerEntry[]; broken: number } => {
  const file = ledgerPath(id);
  if (!existsSync(file)) return { entries: [], broken: 0 };
  const entries: ILedgerEntry[] = [];
  let broken = 0;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (line.trim() === '') continue;
    try {
      const parsed: unknown = JSON.parse(line);
      if (isRecord(parsed)) entries.push(parsed as unknown as ILedgerEntry);
      else broken += 1;
    } catch {
      broken += 1;
    }
  }
  return { entries, broken };
};

/** 지금 붙어 있는 판정 — **장부의 마지막 말**이다. 앞의 말은 지워지지 않고 남는다. */
export interface ICurrentJudgment {
  caseId: string;
  verdict: IVerdictInput | null;
  at: string;
  by: IActor;
  /** 이 케이스가 몇 번 고쳐졌나. 1이면 한 번 적은 것이다. */
  revisions: number;
}

const currentOf = (entries: ILedgerEntry[]): ICurrentJudgment[] => {
  const last = new Map<string, ICurrentJudgment>();
  for (const e of entries) {
    const prior = last.get(e.caseId);
    last.set(e.caseId, {
      caseId: e.caseId,
      verdict: e.verdict,
      at: e.at,
      by: e.by,
      revisions: (prior?.revisions ?? 0) + 1,
    });
  }
  return [...last.values()];
};

export interface IJudgments {
  /** 지금 붙어 있는 것(케이스마다 마지막 말). */
  current: ICurrentJudgment[];
  /** ⛔ 덮어쓴 것 · 지운 것까지 **전부**. 판단이 바뀐 것은 없던 일이 아니다. */
  ledger: ILedgerEntry[];
  /** 못 읽은 장부 줄 수. 0이 아니면 **판정이 사라졌을 수 있다** — 조용히 넘기지 않는다. */
  brokenLines: number;
  /**
   * ⛔ **적힌 것이 세어진 것은 아니다.** 몇 건을 적었는지는 서버의 장부이고,
   *    그중 몇 건이 「판단」인지는 계약(`report.done.unjudged`)만 답한다.
   */
  note: string;
}

const judgmentsOf = (id: string): IJudgments => {
  const { entries, broken } = readLedger(id);
  return {
    current: currentOf(entries),
    ledger: entries,
    brokenLines: broken,
    note:
      '여기 적힌 수는 **적힌 판정의 수**다. 그중 몇 건이 「판단」으로 세어지는지는 ' +
      '계약이 정한다 — `report.done.unjudged` 를 보라. 사유가 짧은 accepted 는 ' +
      '저장은 되되 **판단하지 않은 것으로 세어진다.**',
  };
};

/** 화면에 그대로 나가는 한 주행. ⭐ `receipt` 는 **도구의 답 그대로**다. */
export interface IJudgedRun extends IRunReceipt {
  id: string;
  run: IRunMeta & {
    /**
     * 판정을 붙여 **다시 쟀는가.** `true` 면 위 `shape` 는 `contract` 다 —
     * 원문이 Playwright 였어도 판정을 붙일 칸이 계약 모양에만 있기 때문이다.
     */
    remeasured: boolean;
  };
  judgments: IJudgments;
}

const readMeta = (id: string): IRunMeta | null => {
  const file = metaPath(id);
  if (!existsSync(file)) return null;
  const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
  return isRecord(parsed) ? (parsed as unknown as IRunMeta) : null;
};

/**
 * 받은 주행을 **남긴다.** ⛔ 여기서 다시 재지 않는다 — 재는 것은 `receiveRunResult` 가
 * 이미 했고, 그 답(`receipt`)을 그대로 받아 옆에 둔다.
 *
 * ⚠️ 원문(`raw`)에는 내부 URL·계정이 섞여 온다. 그래서 `.data/`(gitignore) 안에만 쓴다.
 */
export const saveRun = (
  raw: string,
  receipt: IRunReceipt,
  options: { from?: string | undefined } = {},
): IRunMeta => {
  const id = randomBytes(8).toString('hex');
  mkdirSync(runDir(id), { recursive: true });
  const meta: IRunMeta = {
    id,
    receivedAt: new Date().toISOString(),
    receivedBy: actorNow(),
    receivedShape: receipt.shape,
    from: options.from ?? null,
  };
  writeFileSync(metaPath(id), JSON.stringify(meta, null, 2), 'utf8');
  writeFileSync(rawPath(id), raw, 'utf8');

  /**
   * 판정을 붙일 수 있는 모양으로 되살려 둔다. ⛔ 못 되살렸으면(도구가 ⚪ 로 끝났다)
   * **빈 것을 만들어 두지 않는다** — 없는 케이스에 판정이 붙는 자리가 생긴다.
   */
  const input = inputFromReport(receipt.report);
  if (input !== null) writeFileSync(inputPath(id), JSON.stringify(input, null, 2), 'utf8');
  return meta;
};

/** 저장해 둔 계약 입력. 없으면 `null`(그 주행은 판정을 붙일 자리가 없다). */
const readInput = (id: string): Record<string, unknown> | null => {
  const file = inputPath(id);
  if (!existsSync(file)) return null;
  const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
  return isRecord(parsed) ? parsed : null;
};

/**
 * 저장해 둔 입력에 **지금의 판정을 붙인다.**
 *
 * ⛔ 판정이 판정인지 보지 않는다. 짧은 사유도, 모르는 종류도 **그대로 붙여서** 도구에 넘긴다 —
 *    「이건 판단이 아니다」라고 말하는 자리는 계약 하나뿐이어야 한다.
 * ⚠️ 장부에 `verdict: null`(지웠다) 이 있으면 원문에 있던 판정도 **떼어낸다.** 사람이
 *    지운 것을 서버가 되살리면 지웠다는 판단이 없던 일이 된다.
 */
const withJudgments = (
  input: Record<string, unknown>,
  current: ICurrentJudgment[],
): Record<string, unknown> => {
  const byId = new Map(current.map((j) => [j.caseId, j.verdict]));
  const cases = Array.isArray(input['cases']) ? input['cases'] : [];
  return {
    ...input,
    cases: cases.map((c) => {
      if (!isRecord(c) || typeof c['id'] !== 'string') return c;
      if (!byId.has(c['id'])) return c;
      return { ...c, verdict: byId.get(c['id']) ?? null };
    }),
  };
};

/**
 * 주행 하나를 **판정이 붙은 채로** 다시 읽는다.
 *
 * ⭐ 판정이 하나라도 있으면 **도구를 다시 부른다.** 서버가 「판단하지 않은 fail 이 하나
 *    줄었다」를 계산하지 않는다 — 그 수를 내는 자리는 계약 하나뿐이다.
 */
export const readRun = async (id: string): Promise<IJudgedRun | null> => {
  const meta = readMeta(id);
  if (meta === null) return null;
  const judgments = judgmentsOf(id);
  const input = readInput(id);

  if (input === null) {
    /* 되살릴 입력이 없다 = 처음 받을 때 도구가 ⚪ 로 끝났다. 원문 그대로 다시 재게 한다. */
    const receipt = await receiveRunResult(readFileSync(rawPath(id), 'utf8'), {
      ...(meta.from === null ? {} : { from: meta.from }),
    });
    return { ...receipt, id, run: { ...meta, remeasured: false }, judgments };
  }

  const receipt = await receiveRunResult(
    JSON.stringify(withJudgments(input, judgments.current)),
    { from: 'contract' },
  );
  return { ...receipt, id, run: { ...meta, remeasured: true }, judgments };
};

/** 판정을 적으려 했을 때의 답. ⛔ 「없는 케이스」는 **거절**이지 결과가 아니다. */
export type IRecordResult =
  | { ok: true; run: IJudgedRun }
  | { ok: false; kind: 'no-such-run' }
  | { ok: false; kind: 'no-verdict-slot'; why: string }
  | { ok: false; kind: 'no-such-case'; why: string; knownIds: string[] };

/**
 * 판정 하나를 적는다. **한 번에 한 케이스다.**
 *
 * ⛔ **없는 케이스 id 는 거절한다** — 조용히 만들지 않는다. 만들면 그 케이스는 주행에 없던
 *    것이라 분모에도 안 들고 화면에도 안 뜨는데 **장부에는 「판정했다」로 남는다.**
 *    그게 정확히 이 저장소가 막는 「안 잰 것이 통과로 세어지는」 자리다.
 * ⛔ **짧은 사유를 막지 않는다.** 사람이 쓰던 중일 수 있다. 저장하고, 세지 않는 것은 계약이 한다.
 */
export const recordVerdict = async (
  id: string,
  caseId: string,
  verdict: IVerdictInput | null,
  untrustedClientClaim?: unknown,
): Promise<IRecordResult> => {
  const meta = readMeta(id);
  if (meta === null) return { ok: false, kind: 'no-such-run' };

  const input = readInput(id);
  if (input === null) {
    return {
      ok: false,
      kind: 'no-verdict-slot',
      why:
        '이 주행에는 판정을 붙일 자리가 없다 — 처음 받을 때 도구가 ⚪(못 쟀다)로 끝나서 ' +
        '케이스 목록이 안 나왔다. 주행 결과를 고쳐 다시 올려야 한다.',
    };
  }

  const known = caseIdsOf(input);
  if (!known.includes(caseId)) {
    return {
      ok: false,
      kind: 'no-such-case',
      why: `이 주행에 그런 케이스가 없다: ${caseId} — 서버가 만들어 주지 않는다.`,
      knownIds: known,
    };
  }

  const before = readLedger(id);
  const priorEntry = [...before.entries].reverse().find((e) => e.caseId === caseId);
  const entry: ILedgerEntry = {
    seq: before.entries.length + 1,
    at: new Date().toISOString(),
    by: actorNow(),
    caseId,
    verdict,
    /* 덮어쓴 것을 남긴다 — 「고쳤다」를 「받아들인다」로 바꾼 것은 **판단이 바뀐 것**이다. */
    replaced: priorEntry?.verdict ?? null,
    hadPrevious: priorEntry !== undefined,
    ...(untrustedClientClaim === undefined ? {} : { untrustedClientClaim }),
  };
  mkdirSync(runDir(id), { recursive: true });
  appendFileSync(ledgerPath(id), `${JSON.stringify(entry)}\n`, 'utf8');

  const run = await readRun(id);
  /* 방금 적었는데 못 읽으면 그건 서버가 깨진 것이다 — 조용히 성공으로 접지 않는다. */
  if (run === null) return { ok: false, kind: 'no-such-run' };
  return { ok: true, run };
};

/** 보낸 것의 **모양**만 본다. ⛔ 내용(사유 길이·종류)은 여기서 보지 않는다 — 계약의 몫이다. */
export const verdictInputProblem = (
  body: unknown,
): { problem: string } | { caseId: string; verdict: IVerdictInput | null } => {
  if (!isRecord(body)) return { problem: '판정 본문이 객체가 아닙니다.' };
  const caseId = body['caseId'];
  if (Array.isArray(caseId)) {
    return {
      problem:
        '⛔ 케이스 목록을 받지 않습니다 — 한 번에 한 건입니다. ' +
        '「전부 통과 처리」 같은 일괄 갈래는 만들지 않습니다. 판정은 케이스마다입니다.',
    };
  }
  if (typeof caseId !== 'string' || caseId.trim() === '') {
    return { problem: '어느 케이스인지 caseId 를 적으세요.' };
  }
  /* `verdict: null` = **지운다.** 「안 보냈다」와 구별하려고 키가 없으면 거절한다. */
  if (!('verdict' in body)) {
    return { problem: 'verdict 를 적으세요. 지우려면 verdict: null 을 보내세요.' };
  }
  const verdict = body['verdict'];
  if (verdict === null) return { caseId, verdict: null };
  if (!isRecord(verdict)) return { problem: 'verdict 는 객체이거나 null 이어야 합니다.' };
  if (typeof verdict['kind'] !== 'string') return { problem: 'verdict.kind 는 문자열이어야 합니다.' };
  if (typeof verdict['why'] !== 'string') return { problem: 'verdict.why 는 문자열이어야 합니다.' };
  /**
   * ⛔ 여기서 kind 가 `fixed`·`test-wrong`·`accepted` 중 하나인지 **보지 않는다.**
   *    모르는 종류는 계약이 「판단이 아니다」라고 말한다(`validateVerdict`). 서버가 목록을
   *    복사해 두면 계약이 종류를 하나 늘리는 날 화면에서만 거절당한다.
   */
  return { caseId, verdict: { kind: verdict['kind'], why: verdict['why'] } };
};

export interface IRunListItem extends IRunMeta {
  /**
   * ⛔ **적힌 판정의 수**다. 「판단한 수」가 아니다 — 사유가 짧은 accepted 도 여기 센다.
   *    그 판별은 주행을 열어야(다시 재야) 나온다.
   */
  verdictsRecorded: number;
  /** 판정을 지운 항목 수. 목록에서도 「없던 일」로 보이지 않게 한다. */
  verdictsCleared: number;
}

/**
 * 남아 있는 주행 목록.
 *
 * ⛔ **여기에 「끝났다/안 끝났다」를 적지 않는다.** 그 답은 다시 재야 나오고, 목록을 그리려고
 *    캐시해 두면 그 순간부터 두 자리가 갈린다. 목록은 **문을 여는 손잡이**일 뿐이다.
 */
export const listRuns = (): { runs: IRunListItem[]; note: string } => {
  const dir = storeDir();
  if (!existsSync(dir)) return { runs: [], note: NOTE_LIST };
  const runs: IRunListItem[] = [];
  for (const id of readdirSync(dir)) {
    if (runIdProblem(id) !== null) continue;
    const meta = readMeta(id);
    if (meta === null) continue;
    const current = currentOf(readLedger(id).entries);
    runs.push({
      ...meta,
      verdictsRecorded: current.filter((j) => j.verdict !== null).length,
      verdictsCleared: current.filter((j) => j.verdict === null).length,
    });
  }
  runs.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  return { runs, note: NOTE_LIST };
};

const NOTE_LIST =
  '⛔ 이 목록은 「끝났는가」를 말하지 않는다 — 그 답은 주행을 열어 **다시 재야** 나온다. ' +
  'verdictsRecorded 는 **적힌 수**이지 「판단으로 세어진 수」가 아니다.';
