---
name: galaxies
title: 은하
type: index
parent: universe
related: [conservation]
description: 우주의 법칙이 적용되는 저장소들. 우주는 별이 아니라 좌표만 들고 있다.
---

# 은하 (Galaxies)

> 별은 은하에 산다. **우주는 주소만 들고 있다**(보존 법칙).

은하 하나 = 저장소 하나. `galaxies/{name}.json` 이 그 좌표다 —
경로 · 명령 · 켤 법칙 · 태양계 목록.

## 무엇이 여기 사는가

<!-- GALAXIES:BEGIN -->
| 은하 | 켠 법칙 | 태양계 | 선언한 명령 |
|---|---:|---:|---|
| `tiny-galaxy` | 6개 | 1개 | `build` · `test` · `lintJson` · `testFile` · `lintFix` · `typecheck` · `e2eOrigins` |
| `messy-galaxy` | 6개 | 1개 | — |
<!-- GALAXIES:END -->

⛔ **이 표는 `universe facts` 가 좌표 파일에서 생성한다 — 손으로 고치지 마라.**
⚠️ 실측(2026-09-08): 여기 `_(아직 없음)_` 이라 적혀 있었고 실제로는 넷이 등록돼 있었다.
「은하가 없다」는 이 제품에서 **「실측 대상이 없다」**는 뜻이라 가장 무거운 거짓말이다.

실측 대상 은하가 하나도 없으면 `observe.mjs` 는 **커버리지만** 보고 그렇게 말한다 —
없는 것을 있는 척하지 않는다.

## 은하를 등록할 때

1. `universe.config.json` 의 `galaxies` 배열에 이름을 올린다.
2. `galaxies/<이름>.json` 에 좌표를 둔다 — 경로 · 명령 · 켤 법칙 · 태양계.
3. 코드가 `<appDir>/src` 밖에 살면 `codeDirs` 를 적는다.

**`codeDirs` 는 선택이다.** 기본은 `<appDir>/src` 이고 그것은 **관례이지 법이 아니다** —
`app/`(Next) · `lib/` · 패키지별 `src` 처럼 다른 자리에 사는 저장소가 흔하다. 그럴 때만 적는다:

```json
{ "appDir": ".", "codeDirs": ["lib", "observatory", "bin"] }
```

안 적으면 그대로 `src` 다. **자동으로 넓히지 않는다** — 넓히면 `dist/`·`scripts/` 가 조용히
분모에 들어와 **프로브를 하나 만들면 늘고 지우면 주는** 기준선이 된다.

⚠️ 이 칸이 왜 생겼는지(R163): 관측이 `src` 를 **세 자리에서** 만들고 있었다. 훑개는 원래 어디든
훑을 수 있는데 부르는 쪽이 막고 있었고, 그래서 `src/` 를 안 쓰는 저장소는 **파일 0개를 보고도**
화면이 「토큰 0건 · 시맨틱 0건」이었다 — **깨끗한 저장소와 구별이 안 됐다.**
지금은 0개를 보면 ⚪ **못 쟀다**(종료코드 3)라고 말한다.

버려질 코드는 분모 밖이다. 관측과 `universe census` 가 **같은 축**을 쓴다 —
`git ls-files --others --ignored` 가 무시한다고 답한 것은 안 훑는다.
git 에게 못 물으면(저장소가 아니거나 git 이 없으면) 「무시되는 것이 없다」가 아니라
**모른다**이고, 화면이 그렇게 말한다(§8).

## 함정 — 남의 좌표는 이 목록에 넣지 않는다

⛔ backoffice · whitehole · wh-luna 는 실측에 쓴 진짜 은하지만 **커밋하지 않는 좌표**라
`galaxies.local/` 에 산다. 절대 경로가 공개 저장소에 올라간 사고가 있었고(R152), 그 뒤로
`universe.config.json` 에서 뺐다. **다시 넣지 마라.**

그 은하들로 잰 기록은 [결과](../docs/04-results.md) 에 그대로 있다 —
**기록은 역사이고, 목록은 지금이다.**
