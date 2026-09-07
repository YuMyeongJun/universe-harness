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

## 참고

- `universe-harness` — ⚪ "못 쟀다" 규율, 계약 우선 장치 (github.com/YuMyeongJun/universe-harness)
- `harness-01` (whitehole-front) — Playwright 거짓 통과 4종 실측
- `catalog-ppt-tc-case` — TC 150건 작성 경험, 분해 기준
