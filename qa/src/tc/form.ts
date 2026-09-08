/**
 * **채워 온 양식 → 계약이 아는 모양.** 순수 함수다 — 파일도 네트워크도 모른다.
 *
 * ⛔ 여기서 **판정하지 않는다.** 「끝났는가」·「검증 분모」·「판단이 판단인가」는 계약
 * (`../run/report.ts` · `../run/contract.ts`)이 안다. 이 파일은 **옮겨 적기**만 한다.
 *
 * ## ⛔ 모르는 것은 조용히 넘기지 않는다 — 넘기면 초록이 는다
 *
 *   · **모르는 칸 이름** → 거부. 사람이 `attribution` 을 `attr` 로 적었으면 그 칸은 안 읽히고,
 *     계약은 「탓을 안 가른 fail」로 읽는다. 정성껏 채운 것이 사라지는 자리다.
 *   · **모르는 값**(`origin: polciy`) → 거부. 계약의 `NON_VERIFYING_ORIGINS` 에 안 걸려
 *     **검증 분모가 늘어난다.** 오타 하나가 「검증했다」를 만든다.
 *   · **id 중복** → 거부. 어느 줄이 이겼는지 화면에 안 나온다.
 *   · **사유만 있고 종류가 없는 판단** → 거부. 계약은 `verdict: null`(판단 안 함)로 읽는데
 *     사람은 사유를 적었으니 **판단했다고 믿는다.** 두 믿음이 갈리는 자리다.
 *
 * ## 이 파일이 **안 재는 것** (§8)
 *   · 사유가 **타당한지**는 안 본다(길이는 계약이 본다).
 *   · `originRef` 가 **진짜 그 자리를 가리키는지**는 안 본다 — 파일을 안 연다.
 *   · 0줄을 읽었으면 「케이스가 없다」가 아니라 **「못 읽었다」**다. 분모를 같이 낸다.
 */
import type { Attribution, CaseOrigin, CaseStatus, ICaseInput, IPrecondition, VerdictKind } from '../run/contract.js';
import {
  ATTRIBUTION_VALUES,
  CASE_COLUMNS,
  HUMAN_COLUMNS,
  OK_VALUES,
  ORIGIN_VALUES,
  PRECONDITION_COLUMNS,
  STATUS_VALUES,
  VERDICT_VALUES,
  specOfCaseColumn,
  specOfPreconditionColumn,
} from './schema.js';
import { dropComments, dropEmptyRows, parseDelimited } from './sv.js';

export interface IFormProblem {
  /** 어디서 났나 — 사람이 표에서 찾을 수 있게 줄 번호를 준다. */
  where: string;
  message: string;
}

export interface IFormRead<T> {
  rows: T[];
  problems: IFormProblem[];
  /** ⛔ **분모.** 머리 줄을 뺀 데이터 줄 수다. 0이면 「없다」가 아니라 **못 읽었다**. */
  dataRows: number;
}

interface IHeaderRead {
  index: Map<string, number>;
  problems: IFormProblem[];
  /** 머리 줄이 표의 몇 번째 행이었나(0 기반). */
  at: number;
}

const readHeader = (
  rows: string[][],
  known: readonly string[],
  required: readonly string[],
): IHeaderRead => {
  const problems: IFormProblem[] = [];
  const header = rows[0];
  if (header === undefined) {
    return { index: new Map(), at: -1, problems: [{ where: '표', message: '빈 표다 — 머리 줄이 없다' }] };
  }
  const index = new Map<string, number>();
  header.forEach((raw, at) => {
    const name = raw.trim();
    if (name === '') return;
    if (!known.includes(name)) {
      problems.push({
        where: `머리 줄 ${at + 1}번째 칸`,
        message:
          `모르는 칸 이름이다: "${name}". 아는 칸은 이것뿐이다 — ${known.join(' · ')}. ` +
          '⛔ 삼키지 않는다: 안 읽힌 칸은 「안 적은 것」과 구별이 안 된다.',
      });
      return;
    }
    if (index.has(name)) {
      problems.push({ where: `머리 줄`, message: `칸 이름이 두 번 나온다: "${name}" — 어느 쪽을 읽을지 모른다` });
      return;
    }
    index.set(name, at);
  });
  for (const name of required) {
    if (!index.has(name)) {
      problems.push({ where: '머리 줄', message: `필수 칸이 없다: "${name}"` });
    }
  }
  return { index, problems, at: 0 };
};

const cell = (row: string[], index: Map<string, number>, name: string): string => {
  const at = index.get(name);
  if (at === undefined) return '';
  return (row[at] ?? '').trim();
};

/** 값 어휘 대조. 모르는 값은 **거부한다** — 조용히 `unknown` 으로 접으면 뜻이 바뀐다. */
const oneOf = <T extends string>(
  raw: string,
  values: readonly string[],
  column: string,
  where: string,
  problems: IFormProblem[],
): T | null => {
  if (raw === '') {
    problems.push({ where, message: `${column} 이 비었다 — 값: ${values.join(' | ')}` });
    return null;
  }
  if (!values.includes(raw)) {
    problems.push({
      where,
      message: `${column} 값이 "${raw}" 다 — 아는 값은 ${values.join(' | ')} 뿐이다. ⛔ 짐작하지 않는다.`,
    });
    return null;
  }
  return raw as T;
};

/** 케이스 표를 읽는다. 머리 줄의 칸 이름으로 짝짓는다 — **칸 순서는 상관없다.** */
export const readCaseRows = (rows: string[][]): IFormRead<ICaseInput> => {
  const known = [...CASE_COLUMNS, ...HUMAN_COLUMNS];
  const required = CASE_COLUMNS.filter((name) => specOfCaseColumn(name).required);
  const { index, problems, at } = readHeader(rows, known, required);
  const body = at === -1 ? [] : rows.slice(at + 1);
  const out: ICaseInput[] = [];
  const seen = new Set<string>();

  body.forEach((row, i) => {
    const where = `데이터 ${i + 1}번째 줄`;
    if (row.length > (rows[at]?.length ?? 0)) {
      problems.push({
        where,
        message:
          `칸이 머리 줄보다 많다 (${row.length} > ${rows[at]?.length ?? 0}). ` +
          '따옴표를 안 감싼 구분자·줄바꿈이 칸을 쪼갠 자리다 — 양식 머리말의 인용 규칙을 보라.',
      });
      return;
    }
    const id = cell(row, index, 'id');
    if (id === '') {
      problems.push({ where, message: 'id 가 비었다 — 이름 없는 케이스는 주행과 짝지을 수 없다' });
      return;
    }
    if (seen.has(id)) {
      problems.push({ where, message: `id 가 두 번 나온다: ${id} — 어느 줄이 이겼는지 화면에 안 나온다` });
      return;
    }
    seen.add(id);

    const origin = oneOf<CaseOrigin>(cell(row, index, 'origin'), ORIGIN_VALUES, 'origin', where, problems);
    const status = oneOf<CaseStatus>(cell(row, index, 'status'), STATUS_VALUES, 'status', where, problems);
    const attribution = oneOf<Attribution>(
      cell(row, index, 'attribution'), ATTRIBUTION_VALUES, 'attribution', where, problems);

    const kindRaw = cell(row, index, 'verdict.kind');
    const why = cell(row, index, 'verdict.why');
    let kind: VerdictKind | null = null;
    if (kindRaw !== '') {
      kind = oneOf<VerdictKind>(kindRaw, VERDICT_VALUES, 'verdict.kind', where, problems);
    } else if (why !== '') {
      problems.push({
        where,
        message:
          'verdict.why 는 적었는데 verdict.kind 가 비었다. ' +
          '⛔ 계약은 이것을 **판단하지 않음**으로 읽는다 — 사유를 적은 사람의 믿음과 갈린다.',
      });
    }

    const flakyRaw = cell(row, index, 'flaky');
    if (flakyRaw !== '' && flakyRaw !== 'yes' && flakyRaw !== 'no') {
      problems.push({ where, message: `flaky 값이 "${flakyRaw}" 다 — yes | no 뿐이다` });
    }

    const httpRaw = cell(row, index, 'evidence.httpStatus');
    let httpStatus: number | null = null;
    if (httpRaw !== '') {
      const n = Number(httpRaw);
      if (!Number.isInteger(n)) {
        problems.push({ where, message: `evidence.httpStatus 가 숫자가 아니다: "${httpRaw}"` });
      } else {
        httpStatus = n;
      }
    }

    if (origin === null || status === null || attribution === null) return;

    const url = cell(row, index, 'evidence.url');
    const screenshot = cell(row, index, 'evidence.screenshot');
    const unmeasuredReason = cell(row, index, 'unmeasuredReason');
    const originRef = cell(row, index, 'originRef');

    out.push({
      id,
      origin,
      originRef: originRef === '' ? null : originRef,
      status,
      attribution,
      evidence: {
        url: url === '' ? null : url,
        httpStatus,
        screenshot: screenshot === '' ? null : screenshot,
      },
      verdict: kind === null ? null : { kind, why },
      ...(flakyRaw === 'yes' ? { flaky: true } : {}),
      ...(unmeasuredReason === '' ? {} : { unmeasuredReason }),
    });
  });

  return { rows: out, problems, dataRows: body.length };
};

/** 전제 표를 읽는다. `ok` 는 **3상태다** — `unknown` 은 「확인 못 했다」이고 「섰다」가 아니다. */
export const readPreconditionRows = (rows: string[][]): IFormRead<IPrecondition> => {
  const required = PRECONDITION_COLUMNS.filter((name) => specOfPreconditionColumn(name).required);
  const { index, problems, at } = readHeader(rows, PRECONDITION_COLUMNS, required);
  const body = at === -1 ? [] : rows.slice(at + 1);
  const out: IPrecondition[] = [];
  const seen = new Set<string>();

  body.forEach((row, i) => {
    const where = `데이터 ${i + 1}번째 줄`;
    const id = cell(row, index, 'id');
    if (id === '') {
      problems.push({ where, message: 'id 가 비었다 — 이름 없는 전제는 왜 못 쟀는지 말해 주지 못한다' });
      return;
    }
    if (seen.has(id)) {
      problems.push({ where, message: `id 가 두 번 나온다: ${id}` });
      return;
    }
    seen.add(id);
    const ok = oneOf<(typeof OK_VALUES)[number]>(cell(row, index, 'ok'), OK_VALUES, 'ok', where, problems);
    if (ok === null) return;
    const detail = cell(row, index, 'detail');
    out.push({
      id,
      ok: ok === 'yes' ? true : ok === 'no' ? false : null,
      ...(detail === '' ? {} : { detail }),
    });
  });

  return { rows: out, problems, dataRows: body.length };
};

/** 파일 본문 → 행렬 (주석·빈 줄을 버린 뒤). 인용이 안 닫혔으면 여기서 던진다. */
export const rowsOf = (text: string, delimiter: string): string[][] =>
  dropEmptyRows(dropComments(parseDelimited(text, delimiter)));
