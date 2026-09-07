# common-qa-harness

정책서 → TC 티켓 → Playwright 자동 테스트로 이어지는 QA 파이프라인.

## 문서

| 문서 | 내용 |
|---|---|
| [docs/tc-ticket-template.md](docs/tc-ticket-template.md) | TC 티켓 표준 양식 (현재 v1.1) |
| [docs/tc-lessons.md](docs/tc-lessons.md) | 각 필드의 근거 — 세 저장소 실측 종합 |

## 이 저장소가 지키려는 것

데인 것은 전부 **"틀린 답"이 아니라 "아무것도 안 잰 초록"** 이었다.

- 404 페이지는 본문 65자·입력 0개·버튼 1개라 **"위반 0건"으로 보인다**
- 요소 0개는 "위반 없음"이 아니라 **미도달·셀렉터 오류 신호**다
- 하한·fallback에서의 일치는 **"따라간다"를 증명하지 못한다**
- 에이전트가 TC도 쓰고 스크립트도 쓰면 **자기 채점**이다

그래서 각 TC마다 한 번씩 묻는다:
**"이게 통과했을 때, 아무것도 안 재고도 통과할 수 있는 경로가 있는가."**

## 도구

| 명령 | 하는 일 | 종료 코드 |
|---|---|---|
| `npm run lint:tickets -- <경로>` | TC 티켓 형식 관문 | `0` 통과 / `1` 위반 / **`3` 못 쟀다** |
| `npm run gate:redfirst -- <spec> -- <실행명령>` | 생성된 spec 이 "처음부터 통과"하지 않는지 | `0` 수용 / `1` 거부 / **`3` 못 쟀다** |
| `npm test` | 변이 시험 — 각 검사가 실제로 무는지 | |

`exit 3` 은 실패도 통과도 아니다. 대상 파일이 0개이거나 spec 을 받지 못한 경우다.
**0개는 "위반 없음"이 아니라 검사가 아무것도 안 본 것이다.**

## 구성

```
src/
├── config/types.ts      프로젝트별 설정 계약 (앱 고유값은 전부 여기로)
├── lint/                ① TC 티켓 정적 관문 — 프로젝트 무관
├── guards/              ② Playwright 가드 — config 주입식, 앱을 알지 않는다
│   ├── measure.ts         assertMeasured / assertFollows / assertContrast
│   └── reach.ts           createReach — 404·얇은 본문·의도치 않은 리다이렉트를 던진다
└── gate/redFirst.ts     ③ 빨간불 관문 — 자기 채점 방지
tests/                   변이 시험 (검사가 죽어 있는지 확인하는 층)
```

새 프로젝트에 붙이려면 `qa-harness.config.example.ts` 를 복사해 라우트와 404 문구만 채우면 된다.

## 참고

- `universe-harness` — ⚪ "못 쟀다" 규율, 계약 우선 장치 (github.com/YuMyeongJun/universe-harness)
- `harness-01` (whitehole-front) — Playwright 거짓 통과 4종 실측
- `catalog-ppt-tc-case` — TC 150건 작성 경험, 분해 기준
