/**
 * **빈 문자열은 「있다」가 아니다.**
 *
 * ⚠️⚠️ 실측(R46): `config.observatory.path ?? 'observatory/engine'` 이
 * 소비 저장소에서 **빈 문자열을 통과시켜** 없는 자리를 가리켰고, 진짜 은하에서
 * 날 Node 스택으로 죽었다. `??` 는 `null`·`undefined` 만 거른다.
 *
 * R47 에서 같은 모양을 두 곳 더 찾았다 — 은하 좌표의 `starRoot` 와 `commands.lintFix`.
 * 설정값은 **사람이 손으로 비우는 일이 흔하다**(키만 남기고 값을 지운다).
 *
 * ⛔ 설정에서 온 문자열에 `??` 를 쓰지 마라. 이것을 써라.
 */
export const firstFilled = (...values) => {
  for (const value of values) {
    if (typeof value === 'string' ? value.trim() !== '' : value !== undefined && value !== null) {
      return value;
    }
  }
  return undefined;
};
