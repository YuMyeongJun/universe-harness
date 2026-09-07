---
name: naming
title: 네이밍 법칙
type: law
scope: matter
applies_to: ["**/*.ts", "**/*.tsx"]
parent: laws
related: [observation]
rules: [quality/naming-intent, quality/magic-number]
description: 이름은 그것이 무엇인지가 아니라 무엇을 위한 것인지를 말한다.
---

# 네이밍 법칙 (Naming)

> 이름은 **무엇인지**가 아니라 **무엇을 위한 것인지**를 말한다.

## 규칙

- `data` · `res` · `item` · `tmp` · `val` · `flag` 같은 이름은 아무것도 말하지 않는다.
  → `pendingTemplates` · `submitCatalogItem`
- boolean 은 보조동사를 갖는다 — `isLoading` · `hasError` · `canSubmit`.

⚠️ **접두사 매칭으로 잡지 마라.** `temp\w*` 로 쓰면 `templateImageRatioLabel` 같은
멀쩡한 이름을 통째로 먹는다 — 이 법칙의 실측 167건 중 **82건이 그 오탐이었다.**
모호한 이름만 잡으려면 뒤에 숫자만 허용해야 한다(`temp\d*`).


## 재는 법

```bash
yarn harness scan --rule quality/naming-intent --sample 20
```

## 위반 시

이름만 고친다. **지적된 것은 이름이지 로직이 아니다** — 로직을 건드리면 리뷰가 불가능해진다.
