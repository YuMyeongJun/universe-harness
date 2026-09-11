/**
 * TC 티켓 마크다운 파서.
 *
 * 프로젝트를 알지 않는다 — 마크다운 구조만 본다.
 * 양식: docs/tc-ticket-template.md (v1.1)
 */

import { isBlank } from './core.js';

export interface ISelectorRow {
  target: string;
  role: string;
  name: string;
  exact: string;
  whenA: string;
  whenB: string;
}

export interface IParsedTicket {
  file: string;
  title: string;
  /** 사전조건: 라벨 → 값 */
  preconditions: Map<string, string>;
  /** Action 번호 목록 (1, 2, 3 ...) */
  actionNumbers: number[];
  /** Action 번호 → 그 아래 Expected 개수 */
  expectedByAction: Map<number, number>;
  /** 부정 검증 줄 (불릿 텍스트) */
  negatives: string[];
  /** 측정 기준 라벨 → 값 */
  measurement: Map<string, string>;
  selectorRows: ISelectorRow[];
  /** 메타데이터 라벨 → 값 */
  metadata: Map<string, string>;
}

const SECTION_RE = /^###\s+(?:[^\s]+\s+)?(\d)\.\s*(.+)$/;
const TITLE_RE = /^##\s+(.+)$/;
/** `- **라벨:** 값` 또는 `- **라벨:** 값 (주석)` */
const FIELD_RE = /^\s*[-*]\s+\*\*(.+?)\s*:?\*\*\s*(.*)$/;
/** `1. **[Action]** ...` */
const ACTION_RE = /^(\d+)\.\s+\*\*\[Action\]\*\*\s*(.*)$/;
/** `- **[Expected]** ...` */
const EXPECTED_RE = /^\s*[-*]\s+\*\*\[Expected\]\*\*\s*(.*)$/;
const BULLET_RE = /^\s*[-*]\s+(?!\*\*\[Expected\]\*\*)(.*)$/;

/** 지시문(blockquote)·빈 줄·주석 제거 */
const isNoise = (line: string): boolean =>
  line.trim() === '' || line.trimStart().startsWith('>') || line.trimStart().startsWith('<!--');

export { isBlank, isDeclaredUnmeasured } from './core.js';

const parseTableRows = (lines: string[]): ISelectorRow[] => {
  const rows: ISelectorRow[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t.startsWith('|')) continue;
    if (/^\|[\s:|-]+\|$/.test(t)) continue; // 구분선
    const cells = t.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length < 6) continue;
    const [target, role, name, exact, whenA, whenB] = cells;
    if (/역할|role/i.test(role ?? '') && /이름|name/i.test(name ?? '')) continue; // 헤더
    rows.push({
      target: target ?? '',
      role: role ?? '',
      name: name ?? '',
      exact: exact ?? '',
      whenA: whenA ?? '',
      whenB: whenB ?? '',
    });
  }
  return rows;
};

export const parseTicket = (file: string, source: string): IParsedTicket => {
  const lines = source.split(/\r?\n/);
  const ticket: IParsedTicket = {
    file,
    title: '',
    preconditions: new Map(),
    actionNumbers: [],
    expectedByAction: new Map(),
    negatives: [],
    measurement: new Map(),
    selectorRows: [],
    metadata: new Map(),
  };

  let section = 0;
  const sectionLines = new Map<number, string[]>();
  let currentAction: number | null = null;

  for (const raw of lines) {
    const titleMatch = TITLE_RE.exec(raw);
    if (titleMatch?.[1] && ticket.title === '') {
      ticket.title = titleMatch[1].trim();
      continue;
    }

    const sectionMatch = SECTION_RE.exec(raw);
    if (sectionMatch?.[1]) {
      section = Number(sectionMatch[1]);
      currentAction = null;
      continue;
    }

    if (!sectionLines.has(section)) sectionLines.set(section, []);
    sectionLines.get(section)?.push(raw);

    if (isNoise(raw)) continue;

    if (section === 1 || section === 4 || section === 6) {
      const field = FIELD_RE.exec(raw);
      if (field?.[1] !== undefined) {
        const label = field[1].replace(/[:：]\s*$/, '').trim();
        const value = (field[2] ?? '').trim();
        const bucket =
          section === 1 ? ticket.preconditions : section === 4 ? ticket.measurement : ticket.metadata;
        // 하위 불릿(⚠️ 설명 등)이 덮어쓰지 않게 첫 값만 취한다
        if (!bucket.has(label)) bucket.set(label, value);
      }
      continue;
    }

    if (section === 2) {
      const action = ACTION_RE.exec(raw);
      if (action?.[1]) {
        currentAction = Number(action[1]);
        ticket.actionNumbers.push(currentAction);
        if (!ticket.expectedByAction.has(currentAction)) ticket.expectedByAction.set(currentAction, 0);
        continue;
      }
      const expected = EXPECTED_RE.exec(raw);
      if (expected && currentAction !== null) {
        const body = expected[1] ?? '';
        if (!isBlank(body)) {
          ticket.expectedByAction.set(currentAction, (ticket.expectedByAction.get(currentAction) ?? 0) + 1);
        }
      }
      continue;
    }

    if (section === 3) {
      const bullet = BULLET_RE.exec(raw);
      if (bullet?.[1] !== undefined && !isBlank(bullet[1])) {
        ticket.negatives.push(bullet[1].trim());
      }
      continue;
    }
  }

  ticket.selectorRows = parseTableRows(sectionLines.get(5) ?? []);
  return ticket;
};
