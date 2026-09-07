/**
 * **왜 빨간불인지 고르는 자리.**
 *
 * ⚠️⚠️ 예전엔 출력의 **꼬리 8줄**을 보여 줬다. 그런데 검사는 실패를 적고 나서도
 * 안내·정보를 더 찍는다 — 그래서 실측(R59)에서 소비 저장소의 드리프트가 났을 때
 * 화면에 뜬 것은 **지문 방식 안내**였고 정작 `❌` 줄은 잘려 나갔다.
 *
 * ⛔ **보여 준 이유가 진짜 이유가 아니면 안 보여 준 것만 못하다.** 사람은 엉뚱한 곳을
 * 뒤지다 「두 번째엔 되네」로 넘기고, 그러다 `--force` 를 습관으로 만든다.
 * ⇒ 실패로 보이는 줄을 **먼저** 고르고, 없을 때만 꼬리를 보여 준다.
 */
/* ⚠️ 표식은 검사마다 다르다 — `❌`·`⛔` 만 보다가 드리프트 줄(`🔴`)을 놓쳤다(실측 R59).
   ⛔ 새 표식을 쓰는 검사를 만들면 여기 더해야 한다. 그게 이 목록의 값이자 약점이다. */
const FAILURE = /[❌⛔🔴]/;

export const whyItFailed = (out, limit = 8) => {
  const lines = out.split('\n').filter(Boolean);
  const marked = lines.filter((line) => FAILURE.test(line));
  const chosen = marked.length > 0 ? marked.slice(0, limit) : lines.slice(-limit);
  return chosen.map((line) => `      ${line.trim()}`).join('\n');
};
