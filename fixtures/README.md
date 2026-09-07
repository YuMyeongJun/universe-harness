---
name: fixtures
title: 픽스처
type: index
parent: universe
related: [observatory, galaxies]
description: 우주가 자기를 시험하는 은하. 실제 서비스가 아니라 스테이지와 빅뱅을 돌리기 위한 최소 저장소다.
---

# 픽스처

`tiny-galaxy` 는 **우주가 자기를 시험하는 은하**다. React 18 + Vite 6 + Vitest 3 + ESLint 9,
게이트 한 바퀴 **3.5~4.2초**. 스테이지 넷이 여기서 돌고 별도 여기서 태어난다.

## ⚠️ 여기가 중첩 git 저장소인 이유 — 지우지 마라

`fixtures/tiny-galaxy/.git` 이 따로 있다. 실수가 아니라 **필요해서**다 —
샌드박스가 `git worktree add` 로 만들어지고, 그러려면 픽스처가 **자기 저장소**여야 한다.

지우면 스테이지가 하나도 못 돈다.

## 두 저장소가 같은 파일을 본다

| | 무엇을 추적하나 |
|---|---|
| 바깥(`universe`) | 픽스처 파일 전부 — **클론하면 바로 돌 수 있게** |
| 안쪽(`tiny-galaxy`) | 같은 파일 + 워크트리 기준점 |

⚠️ 한때 겹침이 **절반**이었다 — 3차 팽창이 만든 별 5파일이 안쪽에만 있고 바깥에서는
영영 `untracked` 로 떴다. 겹칠 거면 **완전히** 겹쳐야 한다. 반쯤 겹치면 `git status` 가
늘 지저분하고, 그 지저분함이 진짜 변경을 가린다.

## 설치

```bash
cd fixtures/tiny-galaxy
npm install
npm approve-scripts esbuild   # npm 11+ 가 postinstall 을 막는다 — 안 하면 vite 가 안 돈다
```

## 여기서 무엇이 도나

```bash
node fixtures/probe/oracle-s04.mjs          # LLM 0회 — 스테이지가 도는지만 본다
node bin/universe.mjs new tiny-galaxy shop <이름> --from "<요구사항>"
```
