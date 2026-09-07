/**
 * 「이 은하를 **다시 재서** 위반과 처방을 화면에 준다」 — 콘솔의 서버 쪽.
 *
 * ⛔⛔ **여기서 위반을 세지 않는다.** 훑고·세고·기준선과 견주는 것은 이미
 *    `observatory/observe.mjs --json` 의 몫이다. 서버가 그것을 다시 구현하면
 *    **두 자리가 조용히 갈린다** — 관문은 빨간데 화면은 초록인 상태가 생긴다
 *    (이 저장소가 R47·R91 에서 반복해서 데인 자리). ⇒ 이 파일은 **부르고, 나른다.**
 *
 * 이 파일이 지키는 것 — 전부 도구의 판정 어휘를 **화면까지 나르는** 일이다:
 *
 *  1. **종료코드를 삼키지 않는다.** `observe` 는 `0`(기준선과 같다) / `1`(드리프트·못 잰 것)
 *     으로 말한다. 셋 다 200 으로 접으면 화면은 「위반이 없다」와 「안 봤다」를 구별할 수 없다 —
 *     그 구별이 이 콘솔의 존재 이유다. ⇒ `exitCode` 를 응답에 **그대로** 싣는다.
 *     ⚠️ 실측: 지금 `observe.mjs` 에는 `emit(0)` 과 `emit(1)` 뿐이다(`3` 은 없다).
 *        그래도 서버는 **0·1 만 안다고 못 박지 않는다** — 모르는 코드가 오면 ⚪ 다.
 *  2. **`observe` 가 죽어도 4xx 를 주지 않는다.** 「그런 은하가 없다」·「기준선이 낡았다」는
 *     **결과**이지 요청이 잘못된 것이 아니다. `galaxy-draft` 가 「그 폴더에 `package.json` 이
 *     없다」를 4xx 로 안 주는 것과 같은 갈림이다. 400 은 **입력의 모양**이 틀렸을 때뿐이다.
 *  3. **JSON 파싱이 실패하면 그것은 ⚪ 다.** ⛔ 빈 목록을 주면 화면이 **초록을 그린다.**
 *     stdout 이 JSON 이 아니면 「못 쟀다」이고, 원문(stdout·stderr)을 그대로 함께 싣는다.
 *  4. **모델을 부르지 않는다.** `observe` 도 안 부른다.
 *  5. ⛔ **`--update` 를 절대 넘기지 않는다.** 그건 기준선을 **쓰는** 명령이다.
 *     화면에서 기준선이 조용히 갱신되면 관문이 도장이 된다. argv 는 이 파일이 **직접 조립**하고,
 *     사람이 준 값은 모양을 검사한 뒤에만 들어간다.
 *
 * ⚠️ **stdout 과 stderr 를 섞지 마라.** `--json` 일 때 사람용 출력은 stderr 로 간다.
 *    `2>&1` 로 합치면 JSON 이 깨지고, 그 깨짐은 위 3번에 걸려 ⚪ 가 된다(초록이 아니라).
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { HARNESS_ROOT } from './paths.js';
import { runNodeTool } from './run-tool.js';

/** 재는 **유일한** 자리. 서버는 이것을 부르기만 한다. */
const toolPath = (): string => join(HARNESS_ROOT, 'observatory/observe.mjs');

/* ── 화면과 맞춘 모양 ─────────────────────────────────────────
   ⚠️ 칸 이름과 뜻은 `web/src/api/types.ts` 의 `IObservation` 주석이 정본이다.
      여기서 이름을 바꾸면 화면이 조용히 빈 칸을 그린다. */

/** 위반 표본 한 건 — **자리 · 코드 · 처방이 한 몸이다**(R94). */
export interface IViolationSample {
  rule: string;
  where: string;
  evidence: string;
  /** ⛔ `null` 은 「처방이 안 왔다」다. 빈 문자열로 접지 않는다 — 화면이 그것을 적어야 한다. */
  fix: string | null;
}

/**
 * 규칙 하나가 이 은하에서 어떤 상태였나. **「0건」은 한 갈래가 아니다**(관측 법칙 §8):
 *  · `fired`           — 발동했다. 건수는 잰 것이다.
 *  · `silent-proven`   — 0건인데 **더러운 은하에서 발동함이 증명된** 규칙이다 ⇒ 위반이 없다.
 *  · `silent-unproven` — 발동한 적이 증명되지 않았다 ⇒ **규칙이 약한지 위반이 없는지 모른다(⚪).**
 */
export type RuleFiring = 'fired' | 'silent-proven' | 'silent-unproven';

export interface IRuleObservation {
  rule: string;
  count: number;
  /** 출처는 도구의 `silentRules` — **서버가 판단하지 않는다.** */
  firing: RuleFiring;
}

export interface ILawObservation {
  law: string;
  title: string;
  /**
   * 이번에 **잰** 건수.
   * ⛔⛔ `null` 은 **안 쟀다**(도구가 `violations: null` 로 말한 것 — 훑은 파일이 0개다)이지
   *    `0`(재서 없다)이 아니다. ⚠️ 화면 타입은 아직 `number` 다 —
   *    거기에 맞추려고 `0` 으로 접으면 R162 를 그대로 되풀이한다(파일 0개를 훑고 「0건」).
   *    ⇒ 접지 않는다. 화면 타입을 `number | null` 로 넓히는 것은 부모가 판단할 일이다.
   */
  total: number | null;
  /** ⛔ `null` 은 **기준선이 없다**(⚪)이지 `0` 이 아니다. */
  baseline: number | null;
  /**
   * 이 법칙이 켠 규칙 **전부** — 발동 안 한 것까지.
   * ⛔ 빼고 주면 화면은 그것을 감출 수밖에 없고, 「위반이 없다」와 「규칙이 약하다」가
   *    한 화면에서 구분되지 않는다.
   */
  rules: IRuleObservation[];
  /**
   * ⚠️ `--sample` 을 안 주면 도구가 `null` 을 준다 — 여기선 `[]` 로 온다.
   *    그때 화면은 「위반이 없다」가 아니라 **「무엇을 고칠지 못 받았다」**고 적어야 한다.
   *    (그래서 아래 `samplesRequested` 를 함께 싣는다 — 0 이면 **안 물어본 것**이다.)
   */
  samples: IViolationSample[];
  /** 표본을 몇 건 **물어봤나**. `0` 이면 위 `samples` 가 빈 것은 「없다」가 아니라 「안 물었다」다. */
  samplesRequested: number;
}

/** 코드인데 규칙이 못 읽은 파일 한 갈래 — **조용한 부분 실명은 0건보다 위험하다**(§8). */
export interface IBlindExtension {
  ext: string;
  files: number;
  /** 은하가 적어 둔 판단. `null` = **아직 판단 안 했다**. */
  judged: string | null;
}

/**
 * **분모** — 이 화면에서 제일 중요한 칸이다.
 * ⚠️ R162: 콘솔 은하의 `appDir` 이 소스 없는 곳을 가리켜 훑개가 **파일 0개**를 보았고,
 *    모든 법칙 0건이 기준선으로 심겼다 — 그 은하는 **영원히 초록**이었다.
 */
export interface IScanScope {
  /** 규칙이 **실제로 읽은** 파일 수. `0` 이면 아무것도 안 본 것이고, `null` 이면 그조차 못 읽었다. */
  files: number | null;
  target: string;
  appDir: string;
  blind: IBlindExtension[];
  fingerprint: string | null;
}

export interface IObservation {
  galaxy: string;
  scope: IScanScope;
  laws: ILawObservation[];
  /**
   * ⚪ **못 쟀다** — 잴 수가 없었던 이유. `null` 이면 **잰 것**이다.
   * ⛔ 이것은 ❌(잰 빨강)가 아니다. 화면은 색과 문구를 갈라 그린다.
   */
  unmeasured: string | null;
  /** 도구가 낸 ⓘ·⚠️·⛔ 줄 — **고쳐 적지 않고 그대로.** */
  notes: string[];
  /**
   * ⭐ **도구의 종료코드.** `0` = 기준선과 같다 · `1` = 드리프트이거나 못 잰 것이 있다 ·
   * 그 밖(또는 `null`) = **서버가 뜻을 모른다** ⇒ 위 `unmeasured` 가 채워진다.
   * ⛔ 이 값을 응답에서 빼면 화면은 「위반이 없다」와 「안 봤다」를 구별할 수 없다.
   */
  exitCode: number | null;
  /** 재현용 — 사람이 손으로 다시 칠 수 있어야 「했습니다」가 검증된다. */
  tool: {
    command: string;
    exitCode: number | null;
    stdout: string;
    stderr: string;
  };
}

/* ── 입력 검사 ────────────────────────────────────────────────
   ⛔ 여기서 거르는 것은 **모양**뿐이다. 「그런 은하가 없다」는 도구가 답할 일이고,
      그 답은 4xx 가 아니라 200 + ⚪ 로 나간다. */

/**
 * 은하 이름의 **모양**. ⛔ 사람이 준 문자열이 argv 와 경로가 되는 자리를 만들지 않는다(R76).
 * ⚠️ 「없는 이름」은 여기서 막지 않는다 — 아는 은하 목록을 서버가 따로 들면
 *    `universe.config.json` 과 **두 자리가 갈린다.** 도구가 answer 하게 둔다.
 */
const NAME_SHAPE = /^[a-z0-9][a-z0-9-]{0,63}$/;
export const galaxyNameProblem = (name: string): string | null => {
  if (name.trim() === '') return '은하 이름을 적으세요.';
  if (!NAME_SHAPE.test(name)) return `은하 이름이 올바르지 않습니다: ${name}`;
  return null;
};

/** 표본 수. 도구의 `--sample` 그대로다. ⛔ 조용히 깎지 않는다 — 물어본 것과 받은 것이 갈린다. */
const SAMPLE_MAX = 200;
export const sampleProblem = (raw: string): string | null => {
  if (!/^\d+$/.test(raw)) return `표본 수는 0 이상의 정수여야 합니다: ${raw}`;
  if (Number(raw) > SAMPLE_MAX) return `표본 수가 너무 큽니다(최대 ${SAMPLE_MAX}): ${raw}`;
  return null;
};

/* ── 도구의 말을 읽는다 ────────────────────────────────────── */

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const asString = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const asNumber = (v: unknown): number | null => (typeof v === 'number' ? v : null);

/** 도구가 적은 「못 쟀다」 한 줄을 사람이 읽는 문장으로. **말을 고치지 않는다** — 붙이기만 한다. */
const unmeasuredLine = (entry: unknown): string | null => {
  if (!isRecord(entry)) return null;
  const kind = asString(entry['kind']) ?? '?';
  const why = asString(entry['why']) ?? '(도구가 이유를 적지 않았다)';
  const whatRaw = entry['what'];
  const what =
    typeof whatRaw === 'string'
      ? whatRaw
      : Array.isArray(whatRaw)
        ? whatRaw.map((x) => String(x)).join(' · ')
        : null;
  return what === null ? `[${kind}] ${why}` : `[${kind}] ${what} — ${why}`;
};

const unmeasuredLines = (v: unknown): string[] =>
  asArray(v)
    .map(unmeasuredLine)
    .filter((s): s is string => s !== null);

/**
 * 사람용 줄(stderr)에서 ⓘ·⚠️·⛔ 를 **그대로** 골라낸다.
 *
 * ⛔ **여기서 숫자를 뽑지 않는다.** 문구를 파싱해 값을 만들면 도구가 한 글자만 고쳐도
 *    화면이 조용히 빈 값을 그린다 — 그게 `--json` 이 생긴 이유다. 이건 **문장을 옮기는** 것이고,
 *    판정(⚪·건수·기준선)은 전부 위의 JSON 에서만 온다.
 */
const NOTE_HEAD = /^(ⓘ|⚠️|⛔)/;
const OTHER_HEAD = /^(✅|❌|──|태양계:)/;
const noteLines = (stderr: string): string[] => {
  const lines = stderr.split('\n');
  const notes: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (!NOTE_HEAD.test(line.trim())) continue;
    const block = [line.trim()];
    /* 이어지는 들여쓴 줄은 같은 말의 뒷부분이다 — 끊어 실으면 문장이 반토막 난다. */
    for (let j = i + 1; j < lines.length; j += 1) {
      const next = lines[j] ?? '';
      const body = next.trim();
      if (body === '' || NOTE_HEAD.test(body) || OTHER_HEAD.test(body)) break;
      if (!/^\s/.test(next)) break;
      block.push(body);
      i = j;
    }
    notes.push(block.join('\n'));
  }
  return notes;
};

/** 못 쟀을 때의 답 — 지어낸 0 대신 **이유**를 준다. */
const unmeasuredResult = (
  galaxy: string,
  why: string,
  tool: IObservation['tool'],
): IObservation => ({
  galaxy,
  /* ⛔ `files: 0` 이 아니라 `null` 이다. 0 은 「재서 아무것도 없었다」로 읽힌다. */
  scope: { files: null, target: '', appDir: '', blind: [], fingerprint: null },
  /* ⛔ `laws: []` 는 「법칙이 없다」가 아니라 「못 봤다」다 — 그래서 `unmeasured` 가 함께 간다. */
  laws: [],
  unmeasured: why,
  notes: noteLines(tool.stderr),
  exitCode: tool.exitCode,
  tool,
});

/** 법칙 하나를 옮긴다. ⛔ 발동 안 한 규칙을 **빼지 않는다.** */
const lawOf = (raw: unknown, proven: Map<string, boolean>): ILawObservation | null => {
  if (!isRecord(raw)) return null;
  const law = asString(raw['name']);
  if (law === null) return null;

  /* 발동한 규칙의 건수. 나머지는 0 이다 — 목록에서 빼는 것이 아니라 **0 으로 적는다.** */
  const counted = new Map<string, number>();
  for (const r of asArray(raw['rules'])) {
    if (!isRecord(r)) continue;
    const id = asString(r['id']);
    const n = asNumber(r['count']);
    if (id !== null && n !== null) counted.set(id, n);
  }
  const enabled = asArray(raw['rulesEnabled'])
    .map(asString)
    .filter((s): s is string => s !== null);
  /* 도구가 건수를 준 규칙이 `rulesEnabled` 에 없는 일은 없어야 하지만, 있으면 **버리지 않는다.** */
  for (const id of counted.keys()) if (!enabled.includes(id)) enabled.push(id);

  const rules: IRuleObservation[] = enabled.map((id) => {
    const count = counted.get(id) ?? 0;
    if (count > 0) return { rule: id, count, firing: 'fired' };
    /* ⛔ 명부를 못 읽었으면 `silent-proven` 으로 올리지 않는다 — 모르는 것은 ⚪ 쪽이다. */
    return { rule: id, count, firing: proven.get(id) === true ? 'silent-proven' : 'silent-unproven' };
  });

  const samples: IViolationSample[] = asArray(raw['samples'])
    .map((s): IViolationSample | null => {
      if (!isRecord(s)) return null;
      const rule = asString(s['rule']);
      if (rule === null) return null;
      return {
        rule,
        where: asString(s['where']) ?? '(자리를 못 받았다)',
        evidence: asString(s['evidence']) ?? '',
        fix: asString(s['fix']),
      };
    })
    .filter((s): s is IViolationSample => s !== null);

  return {
    law,
    title: asString(raw['title']) ?? law,
    /* ⛔ `violations` 가 `null` 이면 **안 쟀다**다. `rawTotal` 로 메우지 않는다. */
    total: asNumber(raw['violations']),
    baseline: asNumber(raw['baseline']),
    rules,
    samples,
    samplesRequested: asNumber(raw['samplesRequested']) ?? 0,
  };
};

/** 규칙별 「발동함이 증명되었는가」. 명부를 못 읽었으면 **비운다** — 모르는 것을 안다고 하지 않는다. */
const provenMap = (silentRules: unknown): Map<string, boolean> => {
  const map = new Map<string, boolean>();
  if (!isRecord(silentRules)) return map;
  if (silentRules['provenListRead'] !== true) return map;
  for (const r of asArray(silentRules['rules'])) {
    if (!isRecord(r)) continue;
    const id = asString(r['id']);
    if (id !== null) map.set(id, r['proven'] === true);
  }
  return map;
};

const blindOf = (scanned: unknown): IBlindExtension[] => {
  if (!isRecord(scanned)) return [];
  const blind = scanned['blind'];
  if (!isRecord(blind)) return [];
  const byExt = isRecord(blind['byExt']) ? blind['byExt'] : {};
  const judged = isRecord(blind['judged']) ? blind['judged'] : {};
  return Object.entries(byExt).map(([ext, files]) => ({
    ext,
    files: asNumber(files) ?? 0,
    /* `null` = 이 은하가 **아직 판단 안 했다**. 빈 문자열로 접지 않는다. */
    judged: asString(judged[ext]),
  }));
};

/* ── 재기 ────────────────────────────────────────────────── */

/**
 * 은하 하나를 다시 잰다 — **도구를 불러서**.
 *
 * ⛔ 실패해도 예외를 던지지 않는다. 「그런 은하가 없다」·「기준선이 낡았다」는 **결과**다.
 */
export const observeGalaxy = async (galaxy: string, sample: number): Promise<IObservation> => {
  /* ⛔ argv 를 여기서 **직접 조립**한다. `--update` 는 이 배열에 절대 들어가지 않는다. */
  const args = ['--galaxy', galaxy, ...(sample > 0 ? ['--sample', String(sample)] : []), '--json'];
  const command = `node observatory/observe.mjs ${args.join(' ')}`;
  const blank = { command, exitCode: null, stdout: '', stderr: '' };

  if (!existsSync(toolPath())) {
    return unmeasuredResult(
      galaxy,
      `관측 도구를 못 찾았다: ${toolPath()}\n서버는 위반을 직접 세지 않는다 — 도구가 있어야 잰다.`,
      blank,
    );
  }

  const ran = await runNodeTool(toolPath(), args);
  const tool = {
    command,
    exitCode: ran.exitCode,
    stdout: ran.stdout,
    stderr: ran.killed ? `${ran.stderr}\n⛔ 도구가 시간 안에 끝나지 않아 끊었다(120초).` : ran.stderr,
  };

  /**
   * ⛔ **0·1 이 아닌 코드를 「위반이 없다」로 접지 않는다.** `null`(신호로 죽음·시간 제한)도
   *    여기다. 지금 `observe.mjs` 는 `0`·`1` 만 내지만, 서버가 그걸 **못 박으면**
   *    도구가 새 코드를 내는 날 화면이 조용히 초록이 된다.
   */
  if (ran.exitCode !== 0 && ran.exitCode !== 1) {
    return unmeasuredResult(
      galaxy,
      `관측 도구가 ${ran.exitCode === null ? '코드 없이' : `${ran.exitCode} 로`} 끝났다 — ` +
        '0(기준선과 같다)도 1(드리프트)도 아니라 서버가 뜻을 모른다.\n' +
        (tool.stderr.trim() || '(도구가 아무 말도 남기지 않았다)'),
      tool,
    );
  }

  /* ⛔ 3번 규율: JSON 이 아니면 그것은 **⚪** 다. 빈 목록을 주면 화면이 초록을 그린다. */
  let parsed: unknown;
  try {
    parsed = JSON.parse(ran.stdout);
  } catch (e) {
    return unmeasuredResult(
      galaxy,
      `도구의 표준출력이 JSON 이 아니다 — 못 쟀다(위반이 없다는 뜻이 **아니다**).\n` +
        `${(e as Error).message}\n` +
        `⚠️ \`--json\` 일 때 사람용 출력은 stderr 로 간다. stdout 만 JSON 이다.\n` +
        `stdout 앞부분: ${JSON.stringify(ran.stdout.slice(0, 200))}`,
      tool,
    );
  }
  if (!isRecord(parsed) || parsed['schema'] !== 'universe.observe/v1') {
    return unmeasuredResult(
      galaxy,
      `도구가 아는 모양이 아니다(schema: ${JSON.stringify(
        isRecord(parsed) ? parsed['schema'] : null,
      )}) — 서버는 짐작해서 채우지 않는다.`,
      tool,
    );
  }

  /**
   * ⛔ **JSON 이 말한 코드와 프로세스가 낸 코드가 다르면 못 믿는다.** 도구는 둘을 같게 낸다고
   *    적어 두었다(`emit`). 갈리면 어느 쪽이 참인지 서버가 정할 일이 아니다.
   */
  const reported = asNumber(parsed['exitCode']);
  if (reported !== ran.exitCode) {
    return unmeasuredResult(
      galaxy,
      `도구가 JSON 에 적은 종료코드(${reported})와 실제 종료코드(${ran.exitCode})가 다르다 — ` +
        '어느 쪽이 참인지 서버가 정하지 않는다.',
      tool,
    );
  }

  const notes = noteLines(tool.stderr);
  const universeUnmeasured = unmeasuredLines(parsed['unmeasured']);

  const found = asArray(parsed['galaxies']).find(
    (g) => isRecord(g) && g['name'] === galaxy,
  );
  if (!isRecord(found)) {
    /* 「그런 은하가 없다」가 여기로 온다 — ⛔ 4xx 가 아니라 **결과**로 나른다. */
    return {
      ...unmeasuredResult(
        galaxy,
        universeUnmeasured.length > 0
          ? universeUnmeasured.join('\n')
          : `도구가 이 은하를 결과에 담지 않았다: ${galaxy}`,
        tool,
      ),
      notes,
    };
  }

  const scanned = isRecord(found['scanned']) ? found['scanned'] : null;
  const scope: IScanScope = {
    files: scanned === null ? null : asNumber(scanned['files']),
    target: asString(found['target']) ?? '',
    appDir: asString(found['appDir']) ?? '',
    blind: blindOf(scanned),
    fingerprint: scanned === null ? null : asString(scanned['fingerprint']),
  };

  const proven = provenMap(found['silentRules']);
  const laws = asArray(found['laws'])
    .map((l) => lawOf(l, proven))
    .filter((l): l is ILawObservation => l !== null);

  /**
   * ⚪ **못 쟀다**를 모으는 자리. ⛔ 서버가 **고르지 않는다** — 도구가 「못 쟀다」고 적은 것은
   * 전부 나른다. 어느 ⚪ 가 중요한지는 사람이 볼 일이다.
   */
  const reasons: string[] = [...universeUnmeasured];
  const notObserved = found['notObserved'];
  if (isRecord(notObserved)) {
    const kind = asString(notObserved['kind']) ?? '?';
    reasons.push(`[${kind}] ${asString(notObserved['why']) ?? '(이유 없음)'}`);
  }
  reasons.push(...unmeasuredLines(found['unmeasured']));
  /**
   * ⛔⛔ **분모를 직접 본다.** 위 목록은 도구가 적어 주는 것이고, 이 한 줄은 **대조**다 —
   *    R162 가 정확히 이 자리다(파일 0개를 훑고 「0건」이 기준선이 됐다). 도구가 말을 바꿔도
   *    파일 0개가 조용히 초록이 되지는 않게 한다.
   */
  if (scope.files === 0) {
    reasons.push(
      `[scanned-zero-files] 훑은 파일이 0개다 — 「위반이 없다」가 아니라 **「안 봤다」**이다` +
        `(appDir: ${JSON.stringify(scope.appDir)} 아래 src/ 를 보라).`,
    );
  } else if (scope.files === null) {
    reasons.push('[no-file-count] 훑은 파일 수를 못 읽었다 — 분모가 없으면 건수는 뜻이 없다.');
  }

  /**
   * ⚠️ **도구가 ⓘ·⚠️ 를 냈는데 서버가 하나도 못 골라냈다면** 그건 「경고가 없다」가 아니라
   *    골라내는 자리가 낡은 것이다. 조용히 빈 목록을 주지 않고 그렇게 적는다.
   */
  const shouldHaveNotes =
    scanned !== null && (scanned['targetChanged'] === true || reasons.length > 0);
  const notesOut =
    notes.length === 0 && shouldHaveNotes && tool.stderr.trim() !== ''
      ? ['⚠️ 서버가 도구의 ⓘ·⚠️ 줄을 하나도 못 골라냈다 — 아래 도구 출력 원문(stderr)을 그대로 보라.']
      : notes;

  return {
    galaxy,
    scope,
    laws,
    /* ⛔ 빈 배열이면 `null` — 「잰 것」이다. 있으면 전부 이어 붙인다. */
    unmeasured: reasons.length > 0 ? [...new Set(reasons)].join('\n') : null,
    notes: notesOut,
    exitCode: ran.exitCode,
    tool,
  };
};
