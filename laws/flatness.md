---
name: flatness
title: 평탄성 법칙
type: law
scope: matter
applies_to: ["**/*.ts", "**/*.tsx"]
parent: laws
related: [naming, observation]
rules: [quality/nested-ternary, quality/early-return]
description: 예외를 먼저 반환해 본류를 평평하게 한다. 본류가 조건문 안쪽 깊이에 파묻히지 않는다.
---

# 평탄성 법칙 (Flatness)

> **본류는 평평하다.** 예외가 먼저 나가고, 남은 것이 본론이다.

## 규칙

- **얼리 리턴** — 로딩·권한없음·빈값은 먼저 반환한다. 본류가 `if` 안쪽 3중첩에 있으면 위반.
- **중첩 삼항 금지** — `a ? b : c ? d : e` 는 읽는 사람을 되돌아가게 만든다.
  얼리 리턴이나 조건별 컴포넌트로 가른다.


## 재는 법

```bash
yarn harness scan --rule quality/nested-ternary --sample 20
yarn harness scan --rule quality/early-return  --sample 20
```

## 위반 시

예외를 위로 올린다. 삼항을 `if` 로 펴는 것이 아니라 **반환을 앞으로 당긴다.**
