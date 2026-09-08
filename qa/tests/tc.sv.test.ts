/**
 * **구분자 표 파서 — 조용히 깨지는 자리를 일부러 밟는다.**
 *
 * ⛔ 여기서 초록이 나오는 것으로는 부족하다. 「순진한 파서(`split('\n')` · `split('\t')`)라면
 * 어떻게 깨지는가」를 **같은 입력으로 같이 재서**, 이 시험이 진짜 그 축을 재는지 보인다.
 * 순진한 파서가 통과해 버리는 시험은 아무것도 지키지 못한다.
 */
import { describe, expect, it } from 'vitest';

import {
  delimiterForFile,
  dropComments,
  dropEmptyRows,
  formatDelimited,
  formatRow,
  parseDelimited,
} from '../src/tc/sv.js';

const TAB = '\t';

describe('구분자는 확장자가 정한다 — 내용으로 짐작하지 않는다', () => {
  it('.tsv 는 탭 · .csv 는 쉼표', () => {
    expect(delimiterForFile('a/b.tsv')).toBe('\t');
    expect(delimiterForFile('a/b.CSV')).toBe(',');
  });
  it('모르는 확장자는 **거부한다** — 짐작하면 한 칸이 여러 칸이 된다', () => {
    expect(() => delimiterForFile('tc.xlsx')).toThrow(/확장자/);
    expect(() => delimiterForFile('tc')).toThrow(/확장자/);
  });
});

describe('⛔ 칸 안의 줄바꿈 — 순진한 파서가 한 줄을 두 줄로 만드는 자리', () => {
  const raw = `id${TAB}why\nTC-1${TAB}"1) 연다\n2) 잠금 문구를 본다"\nTC-2${TAB}짧다\n`;

  it('인용 칸 안의 줄바꿈은 **값**이다 — 행은 3개다', () => {
    const rows = parseDelimited(raw, TAB);
    expect(rows).toHaveLength(3);
    expect(rows[1]?.[1]).toBe('1) 연다\n2) 잠금 문구를 본다');
  });

  it('⚠️ 대조 — 순진한 파서는 같은 입력에서 **4행**을 본다(그래서 이 시험이 필요하다)', () => {
    const naive = raw.trimEnd().split('\n').map((line) => line.split(TAB));
    expect(naive).toHaveLength(4);
  });
});

describe('⛔ 따옴표', () => {
  it('인용 안의 ""는 " 한 자다', () => {
    const rows = parseDelimited(`a${TAB}"문구는 ""5회 실패"" 다"\n`, TAB);
    expect(rows[0]?.[1]).toBe('문구는 "5회 실패" 다');
  });
  it('인용 **밖**의 " 는 그냥 글자다 — 엑셀이 그렇게 뱉는다', () => {
    const rows = parseDelimited(`5"${TAB}b\n`, TAB);
    expect(rows[0]).toEqual(['5"', 'b']);
  });
  it('인용이 안 닫히면 **거부한다** — 조용히 끝까지 삼키면 표 전체가 한 칸이 된다', () => {
    expect(() => parseDelimited(`a${TAB}"안 닫힘\nb${TAB}c\n`, TAB)).toThrow(/안 닫혔다/);
  });
  it('인용 칸 안의 구분자는 값이다 — 쉼표가 든 문장이 CSV 를 안 쪼갠다', () => {
    const rows = parseDelimited('a,"1, 2, 3",c\n', ',');
    expect(rows[0]).toEqual(['a', '1, 2, 3', 'c']);
  });
});

describe('⛔ 엑셀이 붙이는 것 — BOM · CRLF', () => {
  it('BOM 을 지운다 — 안 지우면 첫 칸 이름이 안 맞는다', () => {
    const rows = parseDelimited(`﻿id${TAB}ok\n`, TAB);
    expect(rows[0]?.[0]).toBe('id');
  });
  it('⚠️ 대조 — BOM 을 안 지우면 첫 칸이 "id" 가 아니다', () => {
    expect(`﻿id`).not.toBe('id');
  });
  it('CRLF·CR·LF 를 다 한 줄로 본다', () => {
    expect(parseDelimited(`a\r\nb\rc\n`, TAB)).toEqual([['a'], ['b'], ['c']]);
  });
  it('인용 칸 **안의** CRLF 는 \\n 으로 고른다 — 안 고르면 왕복마다 \\r 이 는다', () => {
    const rows = parseDelimited(`"1\r\n2"\n`, TAB);
    expect(rows[0]?.[0]).toBe('1\n2');
  });
});

describe('주석·빈 줄', () => {
  it('`#` 로 시작하는 **행**만 버린다 — 파싱한 뒤에 버리므로 인용 칸 안의 #줄 은 살아남는다', () => {
    const rows = parseDelimited(`# 설명\nid${TAB}why\nTC-1${TAB}"a\n# 이건 값이다"\n`, TAB);
    const kept = dropComments(rows);
    expect(kept).toHaveLength(2);
    expect(kept[1]?.[1]).toBe('a\n# 이건 값이다');
  });
  it('전부 빈 행은 버린다 — 엑셀이 표 끝에 잘 만든다', () => {
    expect(dropEmptyRows([['a'], ['', ''], ['b']])).toEqual([['a'], ['b']]);
  });
});

describe('왕복 — 쓴 것을 다시 읽으면 같아야 한다', () => {
  const nasty = [
    ['id', 'why'],
    ['TC-1', '탭\t쉼표, 따옴표" 줄바꿈\n다음 줄'],
    ['#해시로시작', '첫 칸이 # 면 감싼다 — 안 그러면 주석으로 버려진다'],
  ];
  for (const [name, delimiter] of [['TSV', '\t'], ['CSV', ',']] as const) {
    it(`${name} 왕복이 맞는다`, () => {
      const text = formatDelimited(nasty, delimiter);
      expect(dropEmptyRows(parseDelimited(text, delimiter))).toEqual(nasty);
    });
  }
  it('첫 칸의 # 만 감싼다 — 다른 칸의 # 는 그냥 글자다', () => {
    expect(formatRow(['#a', '#b'], TAB)).toBe(`"#a"${TAB}#b`);
  });
});
