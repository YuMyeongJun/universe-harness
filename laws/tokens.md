---
name: tokens
title: 토큰 법칙
type: law
scope: matter
applies_to: ["**/*.tsx", "**/*.ts"]
parent: laws
related: [observation]
rules: [tailwind/arbitrary-value, tailwind/theme-hardcoded, tailwind/class-legibility]
description: 색과 여백은 하드코딩하지 않는다. 다만 토큰을 참조하는 임의 값 문법은 위반이 아니다.
---

# 토큰 법칙 (Tokens)

> 색과 여백은 **결정이지 값이 아니다.**

## 규칙

- 임의 값 금지 — `w-[327px]` · `bg-[#3B82F6]` → 디자인 토큰 클래스로.
- `className` 안 raw hex 금지 — 다크 모드가 한 벌로 따라오지 못한다.
- 한 줄 클래스가 200자를 넘으면 `cva` 변형이나 하위 컴포넌트로 가른다.

⚠️ **`bg-[var(--ui-primary-light)]` 는 위반이 아니다.** 문법만 임의 값일 뿐 **토큰을 쓰고 있는
코드**다. 이것을 막으면 관문이 지키라는 것을 지킨 코드를 벌하게 된다(관측 법칙의 실측 사례).


## 재는 법

```bash
yarn harness scan --rule tailwind/arbitrary-value --sample 20
```

## 위반 시

토큰 클래스로 바꾼다. 대응 토큰이 없으면 **토큰을 먼저 만든다** — 임의 값은 토큰 부재의 증상이다.
