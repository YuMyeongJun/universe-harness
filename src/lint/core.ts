/**
 * 린트 공용 타입 — 입력 형식(마크다운 티켓 / 16컬럼 시트)이 달라도 판정 어휘는 하나다.
 *
 * ⚪ 를 별도 심각도로 두는 이유: 2상태로 두면 **안 잰 것이 통과로 세어진다.**
 */

/** ⚪ = 못 쟀다. 통과도 실패도 아니다. 통과율 분모에서 뺀다. */
export type Severity = 'error' | 'unmeasured';

export interface IFinding {
  rule: string;
  severity: Severity;
  message: string;
  /** 왜 이 검사가 있는가 — 근거를 잃으면 검사는 미신이 된다 */
  why: string;
  /** 어느 자리인가 (시트는 `컴포넌트/행번호`, 마크다운은 생략) */
  at?: string;
}

export interface IRule<T> {
  id: string;
  check: (subject: T) => IFinding[];
}

export const err = (rule: string, message: string, why: string, at?: string): IFinding => ({
  rule,
  severity: 'error',
  message,
  why,
  ...(at === undefined ? {} : { at }),
});

export const unmeasured = (rule: string, message: string, why: string, at?: string): IFinding => ({
  rule,
  severity: 'unmeasured',
  message,
  why,
  ...(at === undefined ? {} : { at }),
});

/** 값이 실질적으로 비어 있는가. 템플릿 잔재(`...`, `<...>`, 체크박스)도 빈 것으로 본다. */
export const isBlank = (value: string): boolean => {
  const v = value
    .replace(/`[^`]*`/g, (m) => m.slice(1, -1))
    .replace(/^\s*\[\s*[xX ]?\s*\]\s*/, '')
    .trim();
  if (v === '') return true;
  if (/^\.{2,}$/.test(v)) return true;
  if (/^<.*>$/.test(v)) return true;
  if (/^(TBD|미정|미작성)$/i.test(v)) return true;
  return false;
};

/** "미확인"으로 명시된 값 — 빈 것과 구별한다. 빈 칸은 위반, 미확인은 ⚪. */
export const isDeclaredUnmeasured = (value: string): boolean =>
  /(미확인|해당\s*없음|무관|N\/A)/i.test(value);
