---
name: gravity
title: 중력 법칙
type: law
scope: meta
applies_to: ["**/*.md"]
rules: []
parent: laws
related: [conservation, observation]
description: 모든 문서는 최소 하나의 엣지를 갖는다. 중력에 묶이지 않은 것은 우주에 없다.
---

# 중력 법칙 (Gravity)

> 중력에 묶이지 않은 것은 우주에 없다.

## 규칙

모든 `.md` 자산은 frontmatter 에 **`parent` 또는 `related` 중 최소 하나**를 가져야 한다.
엣지가 없는 문서는 **고아**이고, 고아는 아무도 읽지 않는다.

필수 frontmatter:

```yaml
---
name: {파일명과 같은 슬러그}
title: {사람이 읽는 제목}
type: {law | index | galaxy | log | note}
parent: {상위 노트}        # 또는
related: [{관련 노트}, …]   # 둘 중 최소 하나
description: {한 줄}
---
```

법칙 문서는 여기에 `scope`(meta|matter)와 **`applies_to`**(적용 범위 글롭)를 더한다.

## 왜

원형은 정원 헌법의 `obsidian-md-style` 이다. 거기서 이 규칙의 목적은 Obsidian 그래프였지만,
본질은 그래프 도구와 무관하다 — **연결이 없는 지식은 검색되지 않고, 검색되지 않는 지식은
다시 쓰이지 않는다.** 지식창고가 커질수록 이 법칙만이 창고를 살려 둔다.

## 재는 법

```bash
# frontmatter 에 parent 도 related 도 없는 문서
grep -L -E "^(parent|related):" $(find . -name "*.md" -not -path "./node_modules/*")
```

## 위반 시

엣지를 채운다. **채울 상위가 없다면 그 문서는 필요 없는 문서다.**
