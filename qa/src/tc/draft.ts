/**
 * **정책서/기획 → TC 초안.** 순수 부분 — 자르고, 프롬프트를 짓고, 답을 읽는다.
 * ⛔ **모델을 여기서 안 부른다.** 부르는 자리는 `draft-cli.ts` 이고, 거기가 돈을 쓴다.
 *
 * ## ⛔ 초안은 **검증이 아니다** — 그 칸에 놓는다
 *
 * 모델이 정책서를 읽고 만든 TC 는 「정책에서 나왔다」고 스스로 말할 자격이 없다.
 * 사람이 그 문장을 확인하기 전에는 **출처를 모르는 TC** 다. 계약은 그런 TC 를
 * `NON_VERIFYING_ORIGINS` 에 두고 **검증 분모에서 뺀다.**
 * ⇒ 초안은 그 칸의 출처로 내보낸다. 사람이 확인하고 `origin` 을 `policy` 로 고치고
 *   `originRef` 에 진짜 자리를 적어야 비로소 검증으로 센다.
 * ⚠️ 아래 `DRAFT_ORIGIN` 은 **계약에 물어서** 고른다 — 계약이 바뀌어 그 출처가 검증으로
 *   세어지게 되면 **여기서 죽는다.** 조용히 초록이 느는 것보다 낫다.
 *
 * ## 자르는 규칙 (§8 — 못 자르는 것도 적는다)
 *   · 마크다운 제목(`#`)이 있으면 제목마다 한 덩이. 없으면 **빈 줄로** 나눈 문단마다 한 덩이.
 *   · **본문이 빈 덩이**(제목만 있는 것)는 뺀다 — 확인할 것이 없다. 그리고 **몇 개를 뺐는지 말한다.**
 *     ⛔ 「짧으니까」로는 안 뺀다. 글자 수로 자르면 **한 줄짜리 진짜 요구가 조용히 사라진다** —
 *     「이 조각에 확인할 것이 있나」는 모델이 판단할 몫이고, 없으면 빈 배열을 내라고 시켰다.
 *   · ⛔ 표·그림·첨부는 **못 읽는다.** `.md`·`.txt` 같은 글자 파일만 본다.
 *   · ⛔ 덩이가 「요구사항 하나」인지는 **못 잰다.** 한 문단에 요구가 셋이면 모델이 셋을 낸다 —
 *     그것이 맞는지는 사람이 본다.
 */
import { NON_VERIFYING_ORIGINS, type CaseOrigin } from '../run/contract.js';
import { caseHeader, HUMAN_COLUMNS, CASE_COLUMNS } from './schema.js';

/**
 * 초안이 달고 나가는 출처. **계약이 「검증으로 안 센다」고 정한 것들 중 하나**여야 한다.
 * ⛔ 문자열을 손으로 못 박지 않는다 — 계약에 물어서 고른다.
 */
export const DRAFT_ORIGIN: CaseOrigin = (() => {
  const wanted: CaseOrigin = 'unknown';
  if (!NON_VERIFYING_ORIGINS.includes(wanted)) {
    throw new Error(
      `계약이 바뀌었다: "${wanted}" 가 더 이상 검증 분모 밖이 아니다. ` +
        '⛔ 초안을 이 출처로 내보내면 **사람이 확인하지 않은 TC 가 검증으로 세어진다.** ' +
        `지금 분모 밖인 출처: ${NON_VERIFYING_ORIGINS.join(' · ')}`,
    );
  }
  return wanted;
})();

export const DRAFT_UNMEASURED_REASON =
  '초안이다 — 아직 안 돌렸고, 사람이 출처를 확인하기 전이라 검증으로 안 센다';

export interface IPolicyUnit {
  /** 되짚을 자리 — `파일#L줄`. 그대로 `originRef` 가 된다. */
  anchor: string;
  title: string;
  body: string;
}

export interface ISplitResult {
  units: IPolicyUnit[];
  /** 본문이 비어서 뺀 덩이 수. ⛔ 조용히 빼지 않는다(§8). */
  dropped: number;
}

/**
 * 제목이 **없는** 정책서에서 문단의 이름을 지을 때, 첫 줄에서 가져오는 글자 수.
 *
 * ⛔ 이것은 제목이 아니라 **화면에서 알아보라고 붙이는 자리표**다 — 되짚는 자리는 `anchor`
 * 가 든다. 그래서 잘려도 뜻이 안 상한다. 길면 「부르면 이렇게 된다」 목록이 한 줄을 넘어
 * **몇 번 부르는지가 안 읽힌다** — 돈을 말하는 화면이라 그게 제일 중요하다.
 */
const PARAGRAPH_LABEL_CHARS = 40;

/** 정책서를 「모델 한 번」 단위로 자른다. **한 덩이 = 모델 한 번**이다 — 수가 곧 돈이다. */
export const splitPolicy = (text: string, file: string): ISplitResult => {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const chunks: Array<{ line: number; title: string; body: string[] }> = [];
  const hasHeadings = lines.some((l) => /^#{1,6}\s+\S/.test(l));

  if (hasHeadings) {
    let current: { line: number; title: string; body: string[] } | null = null;
    lines.forEach((line, i) => {
      const heading = /^#{1,6}\s+(.*\S)\s*$/.exec(line);
      if (heading) {
        if (current) chunks.push(current);
        current = { line: i + 1, title: heading[1] as string, body: [] };
        return;
      }
      if (current) current.body.push(line);
    });
    if (current) chunks.push(current);
  } else {
    let current: { line: number; title: string; body: string[] } | null = null;
    lines.forEach((line, i) => {
      if (line.trim() === '') {
        if (current) chunks.push(current);
        current = null;
        return;
      }
      if (current === null) {
        current = { line: i + 1, title: line.trim().slice(0, PARAGRAPH_LABEL_CHARS), body: [] };
      }
      current.body.push(line);
    });
    if (current) chunks.push(current);
  }

  const units: IPolicyUnit[] = [];
  let dropped = 0;
  for (const chunk of chunks) {
    const body = chunk.body.join('\n').trim();
    if (body.replace(/\s/g, '') === '') {
      dropped += 1;
      continue;
    }
    units.push({ anchor: `${file}#L${chunk.line}`, title: chunk.title, body });
  }
  return { units, dropped };
};

/** 모델에게 주는 입력. 시스템 프롬프트는 `qa/templates/tc-draft-prompt.md` 가 들고 있다. */
export const buildPrompt = (unit: IPolicyUnit): string =>
  [
    `# 정책 조각`,
    `자리: ${unit.anchor}`,
    `제목: ${unit.title}`,
    '',
    unit.body,
  ].join('\n');

export interface IDraftCase {
  title: string;
  /** 이 TC 가 근거로 삼은 **정책서의 문장 그대로**. 지어낸 요약이 아니어야 사람이 대조한다. */
  quote: string;
}

export interface IParsedReply {
  cases: IDraftCase[];
  problems: string[];
}

/** ```json 울타리를 벗긴다 — 모델이 자주 두른다. */
const unfence = (text: string): string => {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  return (fenced?.[1] ?? text).trim();
};

/**
 * 모델의 답을 읽는다. **못 읽으면 지어내지 않는다** — 문제로 남기고 0건을 돌려준다.
 * ⛔ 「대충 읽어서 하나라도 건지기」를 안 한다: 잘못 읽은 TC 는 사람이 못 알아본다.
 */
export const parseDraftReply = (text: string, anchor: string): IParsedReply => {
  const problems: string[] = [];
  const body = unfence(text);
  if (body === '') return { cases: [], problems: [`${anchor}: 모델이 빈 답을 냈다`] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (error) {
    return { cases: [], problems: [`${anchor}: 답이 JSON 이 아니다 — ${(error as Error).message}`] };
  }
  if (!Array.isArray(parsed)) {
    return { cases: [], problems: [`${anchor}: 답이 배열이 아니다`] };
  }
  const cases: IDraftCase[] = [];
  parsed.forEach((raw, i) => {
    const row = raw as Partial<IDraftCase>;
    const title = typeof row.title === 'string' ? row.title.trim() : '';
    const quote = typeof row.quote === 'string' ? row.quote.trim() : '';
    if (title === '') {
      problems.push(`${anchor}[${i}]: title 이 없다`);
      return;
    }
    cases.push({ title, quote });
  });
  return { cases, problems };
};

/**
 * 초안 → **양식과 같은 표**. ⛔ 다른 모양으로 내보내지 않는다 —
 * 내보낸 것을 그대로 `tc-form --cases` 에 넣을 수 있어야 고리가 닫힌다.
 */
export const toFormRows = (
  drafts: Array<{ unit: IPolicyUnit; draft: IDraftCase }>,
): string[][] => {
  const header = caseHeader();
  const rows: string[][] = [header];
  drafts.forEach(({ unit, draft }, i) => {
    const values: Record<string, string> = {
      id: `TC-DRAFT-${String(i + 1).padStart(3, '0')}`,
      origin: DRAFT_ORIGIN,
      originRef: draft.quote === '' ? unit.anchor : `${unit.anchor} 「${draft.quote}」`,
      status: 'unmeasured',
      attribution: 'unknown',
      unmeasuredReason: DRAFT_UNMEASURED_REASON,
      'verdict.kind': '',
      'verdict.why': '',
      flaky: '',
      'evidence.url': '',
      'evidence.httpStatus': '',
      'evidence.screenshot': '',
      title: draft.title,
    };
    rows.push(header.map((name) => values[name] ?? ''));
  });
  return rows;
};

/** 양식 위에 얹는 설명 줄 — **이 표가 아직 검증이 아니라는 것**을 표 자신이 말한다. */
export const draftNotice = (policyFile: string): string[] => [
  `# TC 초안 — 모델이 ${policyFile} 를 읽고 만들었다. ⛔ **사람이 확인하기 전이다.**`,
  `#`,
  `# 모든 줄의 origin 이 "${DRAFT_ORIGIN}" 다 — 계약이 **검증 분모에서 빼는** 출처다.`,
  '# 즉 이 표를 그대로 돌리면 검증 분모가 0이고, 도구는 「못 쟀다」(종료코드 3)라고 말한다.',
  '# 그것이 맞다: 사람이 안 본 TC 는 아무것도 검증하지 않는다.',
  '#',
  '# 사람이 할 일 — 한 줄씩 originRef 의 인용문을 정책서에서 대조하고,',
  `#   맞으면 origin 을 policy 로, id 를 진짜 번호로 고쳐라. 그때부터 검증으로 센다.`,
  `#   (계약 칸: ${CASE_COLUMNS.join(' · ')} / 사람 칸: ${HUMAN_COLUMNS.join(' · ')})`,
];
