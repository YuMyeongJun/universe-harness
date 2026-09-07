/**
 * **위키 주소를 좌표로 적지 않는다 — git remote 에서 뽑는다.**
 *
 * ⚠️⚠️ 왜 이 파일이 생겼나(R151). 예전 전파 대상은 Confluence 였고, 그 주소가
 * `universe.config.json` 과 `beacon/pages.json` 에 **박혀서 커밋돼 있었다** —
 * 회사 사이트 · 개인 스페이스 키 · 페이지 id 일곱. 받은 사람에게는 **쓸 수 없는 좌표**이고,
 * 공개 저장소에는 **있어서는 안 되는 좌표**다(사용자 결정 2026-09-07: clone 도 깨끗해야 한다).
 *
 * GitHub 위키는 **그 저장소의 위키 git 저장소**다 — 주소가 `origin` 에서 **파생된다.**
 * ⇒ 적을 좌표가 **없다.** 포크한 사람은 자기 위키로, 원본은 원본 위키로 자동으로 간다.
 *
 * ## 이것이 R07·R17 을 왜 없애나
 *
 * R17 은 「**이 검사는 혼자 못 돈다** — Confluence 는 MCP 로만 읽히고 스크립트의 손이
 * 안 닿는다. 누군가 받아다 줘야 한다」였다. 위키가 **git 저장소**면 스크립트가 `clone` 한다.
 * R07 은 「위키 본문을 읽지 않는다」였다 — 읽을 수 있으면 성립하지 않는다.
 * ⚠️ 그리고 왕복 정규화(표 구분선·불릿·이스케이프 여섯 패턴)가 **통째로 필요 없어진다** —
 * git 은 바이트를 그대로 들고 있다. Confluence 는 XHTML 로 바꿔 저장해서 왕복이 글자를 바꿨다.
 */

/** GitHub 위키는 `<저장소>.wiki.git` 이다. 다른 호스트는 규칙이 다르므로 **짐작하지 않는다.** */
const GITHUB_HOST = /(^|\.)github\.com$/i;

/**
 * `git remote get-url origin` 결과 → 위키 git 주소.
 *
 * ⛔ **모르는 호스트에는 주소를 지어내지 않는다**(§9 · 「명령을 지어내지 않는다」와 같은 규율).
 *    GitLab·Bitbucket 은 위키 주소 규칙이 다르다. 모르면 `null` 을 주고 사람이 적게 한다.
 *
 * @param {string} originUrl `https://github.com/o/r.git` · `git@github.com:o/r.git` 등
 * @returns {{url: string, owner: string, repo: string} | null}
 */
export const wikiRemoteOf = (originUrl) => {
  const raw = String(originUrl ?? '').trim();
  if (raw === '') {
    return null;
  }

  /* SSH 짧은 형식(`git@host:owner/repo.git`)은 URL 로 안 파싱된다 — 먼저 편다. */
  const ssh = /^[\w.-]+@([^:]+):(.+)$/.exec(raw);
  const host = ssh ? ssh[1] : (() => {
    try {
      return new URL(raw).hostname;
    } catch {
      return '';
    }
  })();
  const pathPart = ssh ? ssh[2] : (() => {
    try {
      return new URL(raw).pathname;
    } catch {
      return '';
    }
  })();

  if (!GITHUB_HOST.test(host)) {
    return null;
  }

  const segments = pathPart.replace(/^\/+/, '').replace(/\.git$/, '').split('/').filter(Boolean);
  if (segments.length < 2) {
    return null;
  }
  const [owner, repo] = segments;
  /* ⚠️ 자격증명이 박힌 origin(`https://user:token@github.com/...`)을 그대로 물려주지 않는다 —
     그 주소는 로그와 화면에 찍힌다. 호스트만 쓰고 나머지는 새로 세운다. */
  return { url: `https://github.com/${owner}/${repo}.wiki.git`, owner, repo };
};

/**
 * 위키에서 쓸 파일 이름. GitHub 위키는 **파일 이름이 곧 페이지 제목**이고 `/` 는 못 쓴다.
 * ⚠️ 슬러그를 그대로 쓴다 — 제목을 파일 이름으로 바꾸면 한글 제목이 URL 에서 깨지고,
 *    이름이 바뀔 때마다 **빈 페이지가 쌓인다**(Confluence 에서 id 를 들고 다닌 이유와 같은 문제).
 */
export const wikiFileNameOf = (slug) => `${slug}.md`;
