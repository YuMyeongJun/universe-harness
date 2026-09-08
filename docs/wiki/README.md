---
name: wiki
title: 위키로 나가는 본문
type: index
parent: docs
related: [console-first, beacon, guide]
description: GitHub Wiki 로 발행할 사용 가이드의 정본. 화면만 쓰는 사용자를 위한 네 장이 여기 산다.
---

# 위키로 나가는 본문

> **정본은 이 폴더다. 위키는 뷰다.** 방향은 한쪽뿐이다(`beacon/README.md`).

## 왜 GitBook 이 아니라 GitHub Wiki 인가

이 저장소에는 **이미 발행 기계가 있다.** `beacon/wiki.mjs` 가 `git remote get-url origin` 에서
위키 주소를 **파생시켜** clone → 덮어쓰기 → commit → (`--push` 를 줘야) push 한다.
주소를 어디에도 적지 않으므로 **포크한 사람은 자기 위키로** 자동으로 간다(`lib/wiki-remote.mjs`).

GitBook 은 셋을 새로 지고 온다 — **계정 · 그 계정의 좌표(스페이스 id) · 새 파이프라인.**
좌표를 커밋하면 공개 저장소에서 R151 이 다시 난다(그 사고 때문에 Confluence 를 버렸다).
좌표를 안 커밋하면 **받은 사람은 발행을 못 한다.** 그리고 GitBook 본문은 스크립트가
되읽을 수 없어서 「위키가 손으로 고쳐졌는가」 검사가 **혼자 못 돈다** — 그것이 R17 이었고,
git 위키로 옮기면서 사라진 문제다. ⇒ **되돌릴 이유가 없다.**

## ⛔ 여기 있는 것을 위키에서 고치지 마라

위키에는 diff·리뷰·롤백이 없고, 무엇보다 **관문으로 집행할 수 없다.**
고칠 것이 있으면 이 폴더의 파일을 고친다.

## 장

| 파일 | 위키에서의 이름 | 무엇 |
|------|----------------|------|
| [guide.md](guide.md) | `guide` | 전제 — 화면에서 다 한다 · 여는 법 · 세 가지 색 |
| [guide-screens.md](guide-screens.md) | `guide-screens` | 화면 하나하나가 무엇을 하는가 |
| [guide-walkthrough.md](guide-walkthrough.md) | `guide-walkthrough` | 처음 한 바퀴 — 클릭만으로 |
| [guide-not-yet.md](guide-not-yet.md) | `guide-not-yet` | ⚪ 아직 화면에 없는 칸 |

## 어떻게 나가는가

`beacon/render.mjs` 가 **이 폴더를 읽어** 발행본에 싣는다 — ⛔ 본문을 render 에 옮겨 적지
않았다. 정본이 둘이 되면 **한 자리만 고쳐진다.**

| | |
|---|---|
| 정본 | `docs/wiki/{슬러그}.md` |
| 제목 | 그 파일의 frontmatter `title` — ⛔ 못 읽으면 렌더가 **죽는다**(슬러그로 안 때운다) |
| frontmatter | **떼고 싣는다** — 위키에서는 본문 글자로 보인다 |
| 줄 세우기 | 슬러그 사전순 — `readdir` 순서는 기계마다 다르다 |
| `README.md` | **안 싣는다** — 이건 폴더 안내지 위키 독자의 것이 아니다 |

`beacon/pages.json` 에도 네 슬러그의 이름표가 있다. ⛔ **렌더가 먼저, 이름표가 나중**이다 —
렌더가 내지 않는 슬러그가 이름표에만 있으면 `beacon/publish.mjs` 가
「렌더 산출이 모자란다」로 죽는다.

⚠️ 그 `title` 은 frontmatter 와 **두 벌**이다(publish 가 이름표를 요구한다).
갈렸는지는 렌더가 찍는 제목 목록과 맞대어 보면 안다 — `beacon/out/index.json` 이 들고 있다.
