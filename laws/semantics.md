---
name: semantics
title: 시맨틱 법칙
type: law
scope: matter
applies_to: ["**/*.tsx"]
parent: laws
related: [observation]
rules: [a11y/semantic-element, a11y/img-alt, a11y/button-type, a11y/accessible-name, a11y/input-label]
description: 누르는 것은 버튼이고, 모든 조작 대상에는 이름이 있다. 이 법칙은 lint 가 보지 못한다.
---

# 시맨틱 법칙 (Semantics)

> 누르는 것은 `<button>` 이고, 이동하는 것은 `<a href>` 다.

## 규칙

- `<div onClick>` 금지. 유지하려면 `role` + `tabIndex={0}` + `onKeyDown`(Enter/Space) **셋 다**.
- 아이콘 전용 버튼 · 이미지 · 입력에 **접근 가능한 이름**이 있어야 한다.
  `placeholder` 는 이름이 아니다.
- `<button>` 의 기본 `type` 은 `submit` 이다 — 폼 안에서 의도치 않게 제출된다. 명시하라.

## 왜 이 법칙이 특별한가

**`eslint-plugin-jsx-a11y` 가 설치돼 있지 않다**(설정 파일에서 직접 확인). 즉 이 59건은
**현재 어떤 게이트도 보지 못한다.** 빌드도 린트도 테스트도 전부 초록불인 채로 통과한다.

관문이 유일한 자리다. **이 법칙을 지우면 아무도 대신 봐 주지 않는다.**


## 재는 법

```bash
yarn harness scan --rule a11y/semantic-element --sample 20
```

## 위반 시

시맨틱 요소로 바꾼다. `aria-*` 로 덧칠하는 것은 해결이 아니다 — 그것도 위반이다.
