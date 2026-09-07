/* 일부러 어긴다 — quality/nested-ternary. 이 파일은 generate.mjs 가 만든다. 손으로 고치지 마라. */
export const label = (isA: boolean, isB: boolean) => (isA ? (isB ? 'AB' : 'A') : 'other');
