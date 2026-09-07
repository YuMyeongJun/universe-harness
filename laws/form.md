---
name: form
title: 형태 법칙
type: law
scope: matter
optIn: true
applies_to: ["**/*.ts", "**/*.tsx"]
rules: [repo/no-class, repo/no-enum, repo/arrow-only, repo/interface-prefix, repo/braces-required, ts/no-any]
parent: laws
related: [observation]
description: 팀이 합의한 코드 형태. 보편 법칙이 아니므로 은하마다 켜고 끈다.
---

# 형태 법칙 (Form) — opt-in

> 이 법칙은 **보편이 아니라 합의다.**

## 규칙

- 모든 함수는 화살표 함수. 클래스 금지.
- `enum` 금지 → `as const` 객체 + 유니온 타입.
- 인터페이스는 `I` 접두사(`IUserProps`).
- 모든 조건문에 `{}`.
- `any` 금지 — 실제 타입이나 `unknown` + 좁히기.

## ⚠️ 합의가 없으면 켜지 마라

다른 법칙들과 달리 이것은 **한 조직의 결정**이다. 합의 없는 은하에 걸면 관문이 헛돌고,
**헛도는 관문은 별이 무시하는 법부터 배우게 한다.**

은하 설정 `galaxies/{name}.json` 의 `laws` 배열에 `"form"` 을 넣은 은하에서만 발동한다.

실측 은하 A 은하는 켠다 — 그 저장소의 `CLAUDE.md §3` 이 이미 확정 규칙으로 선언하고 있다.


## 재는 법

```bash
node observatory/observe.mjs --galaxy 실측 은하 A --law form
```

## 위반 시

합의된 은하에서만 고친다. 합의가 없으면 **법칙을 끄는 것이 옳다.**
