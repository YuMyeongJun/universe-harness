---
name: universe
title: Universe
type: index
related: [laws, bigbang, observatory, galaxies, nebula, log]
description: 이 저장소에 깔린 프론트엔드 하네스. 법칙은 문서가 아니라 관문이다.
---

# Universe — 이 저장소의 우주

> **빅뱅 한 번으로 별이 태어나는 프론트엔드 하네스.**

이 디렉터리는 `universe init` 이 깔았다. **여기 있는 것은 당신 팀의 것**이다 —
법칙을 고치고, 기준선을 심고, git 에 올려라.

## 다섯 층

<img src="docs/img/five-layers.svg" alt="우주 · 은하 · 태양계 · 별의 중첩 구조와 빅뱅" width="760" />

별의 주소는 세 마디다: `은하/{저장소} · 태양계/{묶음} · 별/{산출물}`

## 기관과 흐름

<img src="docs/img/organs.svg" alt="법칙·힘·궤도와 관측소·성운·전파의 흐름" width="780" />

## 여기 있는 것

| | 무엇 |
|---|---|
| `laws/` | 무엇이 옳은가. **문서가 아니라 관문이다** — 위반이면 별이 안 태어난다 |
| `orbits/` | 어떻게 반복되는가 (라운드 궤도) |
| `forces/` | 누가 하는가. **명부만 배달된다** — 실물은 이 저장소에서 새로 쓴다 |
| `bigbang/` | 별을 태어나게 하는 명령과 별틀 |
| `observatory/` | 재는 장치 |
| `galaxies/` | 이 저장소의 좌표. **비어 있다 — 당신이 채운다** |
| `nebula/` | 아직 법칙이 아닌 관측. 백로그 |
| `log/` | 라운드마다 무엇을 했고 어떻게 평가했나 |

## 처음 할 일

```bash
universe hooks --install      # 커밋 관문을 켠다 (깔기만 해서는 안 켜진다)
universe observe              # 법칙이 무엇을 잡는지 본다
universe observe --update     # 그 수치를 기준선으로 심는다
universe new <은하> <태양계> <별>
```

⚠️ `universe observe` 는 **관측 엔진**이 있어야 돈다. 엔진은 이 디렉터리에 배달되지
않는다 — 패키지(`@lunasoft-org/universe` 또는 플러그인)가 준다. 엔진을 못 찾으면
`universe.config.json` 의 `observatory.path` 를 확인하라.

## 규칙 하나

> **재는 법 없이 법칙을 늘리지 마라.** 검사가 없는 법칙은 장식이고,
> 장식은 사람에게 관문을 무시하는 법부터 가르친다.

법칙을 더하는 절차는 `laws/README.md` 에 있다.
