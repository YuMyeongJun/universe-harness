/**
 * **frontmatter 만 읽는다.**
 *
 * ⚠️⚠️ 실측(R66): 감사가 `/^forced:/m` 로 **파일 전체**를 훑어, R65 로그 **본문의 예시 코드블록**에
 * 든 `forced: …` 를 진짜 표식으로 읽었다 — 그 라운드는 강제로 닫히지 않았는데
 * 「빨간 관문을 넘어 닫았다」고 보고했다. **산문을 데이터로 읽은 것**이다.
 *
 * ⛔ `closed:` 도 같은 약점을 갖고 있었다 — 본문에 그 낱말을 인용한 로그가 있으면
 * **열린 라운드가 닫힌 것처럼 보인다.** 이 저장소는 로그에 자기 출력을 그대로 인용한다.
 * ⇒ 표식은 **첫 `---` 블록 안에서만** 읽는다.
 */
export const frontmatter = (text) => {
  const block = /^---\n([\s\S]*?)\n---/.exec(text);
  if (!block) { return {}; }
  const out = {};
  for (const line of block[1].split('\n')) {
    const m = /^([\w-]+):\s*(.*)$/.exec(line);
    if (m) { out[m[1]] = m[2].trim(); }
  }
  return out;
};


