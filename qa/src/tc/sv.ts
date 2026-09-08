/**
 * **구분자 표(TSV·CSV)를 손으로 읽고 쓴다.** 파서를 새로 들이지 않는다 — 의존성 0 규율.
 *
 * ⛔⛔ **여기가 조용히 깨지는 자리다.** 사람이 채워 오는 표에는 반드시 이것들이 들어온다:
 * 사유에 든 **줄바꿈**, 인용부호, 쉼표/탭, 엑셀이 앞에 붙이는 **BOM**, 윈도우 **CRLF**.
 * `text.split('\n').map((l) => l.split('\t'))` 로 읽으면 **그 칸들이 조용히 갈린다** —
 * 한 줄이 두 줄이 되고, 사유가 반토막 나고, 첫 칸 이름이 `﻿id` 가 돼 「모르는 칸」이 된다.
 * ⚠️ 그 넷 다 화면에는 「읽었다」로 보인다. 그래서 규칙을 **여기 한 자리에** 적고 시험한다.
 *
 * ## 이 파서가 지키는 규칙 (RFC4180 + 엑셀 실측)
 *
 * 1. **구분자는 확장자로 정한다** — `.tsv` 는 탭, `.csv` 는 쉼표. ⛔ 내용으로 짐작하지 않는다
 *    (쉼표가 든 문장을 CSV 로 짐작하면 한 칸이 여러 칸이 된다).
 * 2. **칸이 `"` 로 시작하면 인용 칸**이다. 그 안의 구분자·줄바꿈은 **값**이고, `""` 는 `"` 한 자다.
 * 3. **인용이 안 닫히면 거부한다.** 끝까지 삼키면 표 전체가 한 칸이 되는데 화면은 조용하다.
 * 4. **인용 밖의 `"` 는 그냥 글자다.** 엑셀이 `5"` 같은 값을 그대로 뱉는다 — 거기서 죽으면 못 읽는다.
 * 5. **줄바꿈은 CRLF·CR·LF 셋 다** 한 줄로 본다. ⚠️ **인용 칸 안의 CRLF 는 `\n` 으로 고른다** —
 *    안 고르면 같은 표를 읽고 쓸 때마다 `\r` 이 늘어나 **왕복이 안 맞는다**(다시 쓰면 파일이 달라진다).
 * 6. **BOM 은 지운다.** 엑셀이 UTF-8 CSV 에 붙이고, 안 지우면 첫 칸 이름이 안 맞는다.
 * 7. **주석 줄(`#`)은 파싱한 뒤에 버린다.** 줄 단위로 먼저 버리면 **인용 칸 안의 `#` 로 시작하는
 *    줄**까지 지운다 — 사람 사유 안에 흔한 글자다.
 *
 * ## ⛔ 이 파서가 **안 하는 것** (§8 — 적어 둔다)
 *   · 엑셀 `.xlsx` 는 **못 읽는다.** 그건 zip 이다. 「빈 표」로 읽지 않고 거부한다.
 *   · 문자 인코딩은 **UTF-8 만** 본다. CP949 로 저장한 CSV 는 깨진 글자로 읽힌다 —
 *     우리는 그것이 깨졌는지 **못 잰다.**
 *   · 칸 안의 앞뒤 공백은 **안 지운다**(값의 일부일 수 있다). 지우는 판단은 읽는 쪽이 한다.
 */

/** 아는 구분자. ⛔ 확장자 → 구분자는 **이 표 하나**다. */
const DELIMITER_BY_EXTENSION: Record<string, string> = {
  '.tsv': '\t',
  '.csv': ',',
};

export type SvFormat = 'tsv' | 'csv';

export const delimiterOf = (format: SvFormat): string =>
  format === 'tsv' ? '\t' : ',';

/** 파일 이름 → 구분자. 모르는 확장자는 **거부한다**(짐작하면 한 칸이 여러 칸이 된다). */
export const delimiterForFile = (file: string): string => {
  const dot = file.lastIndexOf('.');
  const ext = dot === -1 ? '' : file.slice(dot).toLowerCase();
  const delimiter = DELIMITER_BY_EXTENSION[ext];
  if (delimiter === undefined) {
    const known = Object.keys(DELIMITER_BY_EXTENSION).join(' · ');
    throw new Error(
      `구분자를 모르는 확장자다: ${ext || '(없음)'} — 아는 것은 ${known} 뿐이다. ` +
        '⛔ 내용으로 짐작하지 않는다: 쉼표가 든 문장을 CSV 로 읽으면 한 칸이 여러 칸이 된다. ' +
        '엑셀이면 「다른 이름으로 저장 → CSV UTF-8」 로 내보내라(.xlsx 는 zip 이라 못 읽는다).',
    );
  }
  return delimiter;
};

/**
 * 구분자 표 → 행렬. **읽기 규칙은 머리말에 적힌 일곱 가지다.**
 *
 * @throws 인용이 안 닫혔을 때. ⛔ 조용히 끝까지 삼키지 않는다.
 */
export const parseDelimited = (raw: string, delimiter: string): string[][] => {
  // 규칙 6 — BOM. 엑셀이 붙인다. 안 지우면 첫 칸 이름이 `﻿id` 가 된다.
  const text = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let fieldStarted = false;
  let quoteOpenedAtLine = 0;
  let line = 1;

  const endField = (): void => {
    row.push(field);
    field = '';
    fieldStarted = false;
  };
  const endRow = (): void => {
    endField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i] as string;

    /* ⛔ 인용 안의 갈래는 **평평하게** 쓴다 — 「따옴표인가 → 다음도 따옴표인가」로 겹치면
       가장 헷갈리는 규칙(`""`)이 가장 깊은 자리에 숨는다. 각 갈래를 한 줄로 세운다. */
    if (quoted) {
      // 규칙 2 — 인용 안의 `""` 는 `"` 한 자.
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
        continue;
      }
      // 그 밖의 `"` 는 인용을 닫는다.
      if (ch === '"') {
        quoted = false;
        continue;
      }
      // 규칙 5 — 인용 안의 CRLF 를 `\n` 으로 고른다(왕복이 맞아야 한다).
      if (ch === '\r') {
        i += text[i + 1] === '\n' ? 1 : 0;
        field += '\n';
        line += 1;
        continue;
      }
      if (ch === '\n') line += 1;
      field += ch;
      continue;
    }

    if (ch === '"' && !fieldStarted) {
      quoted = true;
      fieldStarted = true;
      quoteOpenedAtLine = line;
      continue;
    }
    if (ch === delimiter) {
      endField();
      continue;
    }
    if (ch === '\r' || ch === '\n') {
      i += ch === '\r' && text[i + 1] === '\n' ? 1 : 0;
      line += 1;
      endRow();
      continue;
    }
    // 규칙 4 — 인용 밖의 `"` 는 그냥 글자다.
    field += ch;
    fieldStarted = true;
  }

  if (quoted) {
    throw new Error(
      `인용부호(")가 안 닫혔다 — ${quoteOpenedAtLine}번째 줄에서 열렸다. ` +
        '⛔ 끝까지 삼키면 표 전체가 한 칸이 되는데 화면은 조용하다. ' +
        '칸 안에 "를 쓰려면 ""로 두 번 적어라.',
    );
  }
  // 마지막 줄에 개행이 없어도 한 행이다. 파일 끝의 개행 하나는 행을 안 만든다.
  if (field !== '' || row.length > 0) endRow();

  return rows;
};

/** 첫 칸이 `#` 로 시작하는 행을 버린다. ⛔ **파싱한 뒤에** 버린다(규칙 7). */
export const dropComments = (rows: string[][]): string[][] =>
  rows.filter((r) => !(r[0] ?? '').startsWith('#'));

/** 모든 칸이 빈 행을 버린다 — 엑셀이 표 끝에 잘 만든다. */
export const dropEmptyRows = (rows: string[][]): string[][] =>
  rows.filter((r) => r.some((cell) => cell.trim() !== ''));

/**
 * 한 칸을 쓴다. **읽는 규칙의 역이다** — 왕복이 안 맞으면 둘 중 하나가 틀린 것이다.
 *
 * @param leading 이 칸이 **행의 첫 칸**인가. 첫 칸이 `#` 로 시작하면 다시 읽을 때
 *                주석으로 버려지므로(규칙 7) 감싼다. ⛔ 다른 칸의 `#` 는 그냥 글자다.
 */
export const formatField = (value: string, delimiter: string, leading = false): string => {
  const needsQuote =
    value.includes(delimiter) ||
    value.includes('"') ||
    value.includes('\n') ||
    value.includes('\r') ||
    (leading && value.startsWith('#'));
  if (!needsQuote) return value;
  return `"${value.replaceAll('"', '""')}"`;
};

/** 한 행 — 줄바꿈 없이. 표에 주석 줄을 섞어 쓰려고 행 단위로도 낸다. */
export const formatRow = (cells: string[], delimiter: string): string =>
  cells.map((cell, at) => formatField(cell, delimiter, at === 0)).join(delimiter);

/** 행렬 → 구분자 표. 줄 끝은 `\n` 이다(엑셀은 둘 다 읽는다). */
export const formatDelimited = (rows: string[][], delimiter: string): string =>
  `${rows.map((r) => formatRow(r, delimiter)).join('\n')}\n`;
