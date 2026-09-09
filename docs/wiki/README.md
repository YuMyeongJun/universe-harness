---
name: wiki
title: 위키로 나가는 본문
type: index
parent: docs
related: [beacon]
description: GitHub Wiki 로 발행할 사용 가이드의 정본. 이 가지에는 지금 장이 없다 — 화면 가이드 넷은 화면과 함께 나갔다.
---

# 위키로 나가는 본문

> **정본은 이 폴더다. 위키는 뷰다.** 방향은 한쪽뿐이다(`beacon/README.md`).

이 폴더의 `.md` 하나가 위키의 장 하나가 된다. 여기 없는 장은 저장소의 실물에서 조립된다.

## 무엇이 여기 사는가

⚪ **지금 이 폴더에 사람이 쓴 장은 없다.**

있던 넷(`guide` · `guide-screens` · `guide-walkthrough` · `guide-not-yet`)은 전부 **화면 안내**였고,
2026-09-09 에 화면과 함께 `feat/console-screens` 가지로 나갔다. 위키의 그 4장은 지우지 않았다 —
좌표는 `.secret/confluence-pages.console.json` 에 있고, 화면을 다시 들이면 그대로 발행된다.

⚠️ 「없다」와 「아직 안 썼다」는 다르다. 여기는 **비어 있는 것이 맞는 상태**다 —
조립되는 장들(`index`·`laws`·`forces`·`observatory`·`galaxies`·`nebula`·`rounds`)은
이 폴더가 아니라 저장소의 실물에서 나온다.

**왜 GitBook 이 아니라 GitHub Wiki 인가.** 이 저장소에는 **이미 발행 기계가 있다** —
`beacon/wiki.mjs` 가 `git remote get-url origin` 에서 위키 주소를 **파생시켜**
clone → 덮어쓰기 → commit → (`--push` 를 줘야) push 한다. 주소를 어디에도 적지 않으므로
**포크한 사람은 자기 위키로** 자동으로 간다(`lib/wiki-remote.mjs`).

GitBook 은 셋을 새로 지고 온다 — **계정 · 그 계정의 좌표(스페이스 id) · 새 파이프라인.**
좌표를 커밋하면 공개 저장소에서 R151 이 다시 난다(그 사고 때문에 Confluence 를 버렸다).
좌표를 안 커밋하면 **받은 사람은 발행을 못 한다.** 그리고 GitBook 본문은 스크립트가
되읽을 수 없어서 「위키가 손으로 고쳐졌는가」 검사가 **혼자 못 돈다** — 그것이 R17 이었고,
git 위키로 옮기면서 사라진 문제다. ⇒ **되돌릴 이유가 없다.**

## 장을 더할 때

`docs/wiki/{슬러그}.md` 를 만들면 `beacon/render.mjs` 가 **이 폴더를 읽어** 발행본에 싣는다.
본문을 render 에 옮겨 적지 않는다 — 정본이 둘이 되면 **한 자리만 고쳐진다.**

| | |
|---|---|
| 정본 | `docs/wiki/{슬러그}.md` |
| 제목 | 그 파일의 frontmatter `title` — ⛔ 못 읽으면 렌더가 **죽는다**(슬러그로 안 때운다) |
| frontmatter | **떼고 싣는다** — 위키에서는 본문 글자로 보인다 |
| 줄 세우기 | 슬러그 사전순 — `readdir` 순서는 기계마다 다르다 |
| `README.md` | **안 싣는다** — 이건 폴더 안내지 위키 독자의 것이 아니다 |

그다음 `beacon/pages.json` 에 그 슬러그의 이름표(제목·부모)를 단다.
**렌더가 먼저, 이름표가 나중**이다 — 렌더가 내지 않는 슬러그가 이름표에만 있으면
`beacon/publish.mjs` 가 「렌더 산출이 모자란다」로 죽는다.

⚠️ 그 `title` 은 frontmatter 와 **두 벌**이다(publish 가 이름표를 요구한다).
갈렸는지는 렌더가 찍는 제목 목록과 맞대어 보면 안다 — `beacon/out/index.json` 이 들고 있다.

## 함정 — 위키에서 고치면 그 수정은 관문을 안 지난다

⛔ 위키에는 diff·리뷰·롤백이 없고, 무엇보다 **관문으로 집행할 수 없다.**
고칠 것이 있으면 이 폴더의 파일을 고친다.
