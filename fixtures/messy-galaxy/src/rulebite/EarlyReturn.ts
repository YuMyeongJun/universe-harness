/* 일부러 어긴다 — quality/early-return. 이 파일은 generate.mjs 가 만든다. 손으로 고치지 마라. */
export const f = (a: boolean, b: boolean, c: boolean) => {
if (a) {
  if (b) {
    if (c) {
      return 1;
    }
  }
}
return 0;
};
