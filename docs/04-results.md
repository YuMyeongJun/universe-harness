---
name: results
title: 결과물 — 무엇이 나오나
type: doc
parent: docs
related: [usage, expectations]
description: 각 명령이 실제로 내놓는 것. 전부 실제 출력이다.
---

# 결과물

**아래는 전부 실제 실행 출력이다.** 꾸민 예시가 아니다.

⚠️⚠️ **다만 「언제·어디서」를 분명히 해야 한다.**

이 우주에는 지금 **등록된 은하가 0개**다(`universe.config.json` 의 `galaxies: []`).
아래 「실측 은하 A」 블록은 이 우주를 만드는 재료가 된 **과거 관측**이고, 그 저장소는
사용자 요청으로 이 우주에서 뺐다. 지금 `universe observe` 를 돌리면 **커버리지만** 나온다.

| 무엇 | 지금도 재현되나 |
|---|---|
| 커버리지 | ✅ **지금 상태다** — 아래 <!-- FACTS --> 블록은 `universe facts` 가 채운다 |
| 「실측 은하 A」의 위반 건수 | ⛔ **과거 기록이다** — 그 은하가 여기 없다 |
| 스테이지 채점 | ✅ 지금 상태다 — `fixtures/tiny-galaxy` 에서 넷 다 돈다 |
| 빅뱅으로 태어난 별 | ⛔ 과거 기록이다 — 그 은하가 여기 없다 |

<!-- FACTS:BEGIN -->
| 지금 상태 | 값 |
|---|---:|
| 법칙 | 11 |
| 계약 규칙 | 20 |
| ↳ 법칙이 덮은 것 | 20 |
| ↳ 성운이 든 것(주인 없는 규칙) | 0 |
| 등록된 은하 | 3 |
| 판 | 0.9.0 |
<!-- FACTS:END -->

⚠️ 위 블록은 **생성된다**(`universe facts`). 손으로 고치지 마라 — `--check` 가 막는다.
이 저장소는 수치를 손으로 적었다가 **여섯 번 낡았다.** 생성된 것은 낡을 수 없다.

**이 구분을 안 하면 문서가 거짓말을 한다.** 「전부 실제 출력」은 사실이지만
「현재 상태」는 절반만 사실이다.

---

## 1. 관측 — 커버리지는 지금 상태, 은하 수치는 과거 기록

```
── 커버리지 — 규칙 20 · 법칙이 덮은 것 19 · 성운 1
  ✅ 주인 없는 규칙 없음

── 실측 은하 A — apps/web/src
  ✅ 토큰 법칙          651건  기준선과 같다
          640  tailwind/arbitrary-value
            8  tailwind/theme-hardcoded
            3  tailwind/class-legibility
  ✅ 시맨틱 법칙          59건  기준선과 같다
           36  a11y/semantic-element
           16  a11y/img-alt
            7  a11y/input-label
  ✅ 네이밍 법칙          85건  기준선과 같다
  ✅ 평탄성 법칙         159건  기준선과 같다
  ✅ 형태 법칙          436건  기준선과 같다

✅ 법칙이 규칙을 빠짐없이 덮고, 은하의 기준선이 실측과 같다.
```

실측 조건: `.ts`/`.tsx` **1,227개**(테스트 제외) · 2026-09-04.

**가장 값진 줄은 접근성 59건이다.** 그 저장소에는 `eslint-plugin-jsx-a11y` 가 설치돼 있지 않다 —
**빌드도 린트도 테스트도 전부 초록불인 채로** 59건이 통과하고 있었다. 관문이 유일한 자리다.

표본(오탐 아님, 눈으로 확인):

```
ISMSAvatar.tsx:10
    <div className="fixed bottom-11 right-2" onClick={() => setIsOpen(true)}>
    → 인증마크 모달을 키보드로 열 수 없다. role·tabIndex·onKeyDown 셋 다 없다.

AiWizardChatPanel.tsx:130
    <input value={input} onChange={…} placeholder={inputPlaceholder} />
    → placeholder 는 접근 가능한 이름이 아니다. 스크린리더에 이름이 없다.
```

## 2. 검증 — 게이트가 초록인데 틀린 자리

```
[CONTRACT SKIPPED] 변경된 소스가 없다
✅ lint:@acme/app-web  error 0 · warning 63
✅ lint:@shared/modules · @shared/components   error 0
✅ build / test / typecheck:e2e / typecheck:node   exit 0
✅ manualChunks 는 함수형이다
✅ 공유 패키지를 소스로 직접 가리키지 않는다
✅ 초기 로드에 무거운 벤더가 없다       초기 청크 7개 · 1700KB
❌ 초기 로드 예산 1.2MB 이하            1700KB
[NOT YET]
```

**게이트 7개가 전부 초록인데 마지막 줄이 빨갛다.** 이것이 「초록불인데 틀린 자리」다.
그리고 이 실행이 예산 설정 오류까지 드러냈다 — 물려받은 1,229KB 는 기준선(1,700KB)보다
낮아서 **결함을 다 고쳐도 통과할 수 없는 축**이었다.

## 3. 빅뱅 — 태어난 별

```
💥 빅뱅 — 실측 은하 A · 태양계 dashboard · 별 DashboardToday
   자리: apps/web/src/components/pages/alimtalk/dashboard/DashboardToday

   + DashboardToday.test.tsx  (23줄)
   + DashboardToday.tsx       (42줄)
   + index.ts                 ( 4줄)
   + useDashboardToday.ts     (33줄)

── 관문 — 은하가 켠 법칙 5개 · 규칙 17개        ← 그때의 출력이다(지금은 다르다)
   ✅ 태어난 별이 법칙을 지킨다.
```

**관문이 무는 것을 음성 시험으로 증명했다.** 템플릿에 일부러 위반을 심었더니:

```
   ❌ [a11y/semantic-element] BadStar.tsx:29
        <div ⏎               onClick=
        → 클릭 가능한 것은 `<button type="button">` 이다.
   ❌ [tailwind/arbitrary-value] BadStar.tsx:24  gap-[16px]
   ❌ [tailwind/arbitrary-value] BadStar.tsx:24  bg-[#FFFFFF]
   ❌ [tailwind/theme-hardcoded]  BadStar.tsx:24
   ❌ [repo/arrow-only]           BadStar.tsx:7

⛔ 별이 태어나지 않았다 — 템플릿이 법칙을 어긴다(위반 5건).
```

**exit 1 · 파일을 쓰지 않는다.** 원복 후 exit 0.

## 4. 우주 자신의 검사

```
── 중력 법칙 — 모든 문서는 parent 또는 related 를 갖는다
── 보존 법칙 — 별(소스 산출물)은 우주 안에 두지 않는다
── 관측 법칙 — 모든 법칙에 「재는 법」이 있다
── frontmatter 필수 필드
── 물질 법칙은 applies_to 와 rules 를 갖는다
── config 정합 — laws · forces · orbits 배열 ↔ 파일
── 관측 법칙 — 검사 명령을 파이프에 물려 판정하지 않는다 (경고만)

✅ 우주가 자기 법칙을 지킨다.
```

첫 실행에서 **우주 자신의 위반 2건**을 잡았고, 모델링 오류 1건(기관의 부모를 잘못 지정)도
검사가 드러냈다.

## 5. 발행 — 위키 7페이지

```
Universe (개요 · 다섯 층 · 무엇이 배달되고 무엇이 안 되나)
├── 법칙 (Laws)            메타 4 + 물질 6 · 규칙 id · 「관측 법칙이 자란 자리」 · 추가 절차
├── 힘 (Forces)            종류 3 + 관측자 + 발견 카탈로그
├── 관측소 (Observatory)   다섯 장치 · 엔진 · 지켜야 할 것 · 관문이 먼저인 이유
├── 은하 (Galaxies)        등록법 + 좌표 스키마
├── 성운 (Nebula)          형식 + 「0건은 무죄가 아니다」
└── 라운드 (Rounds)        평가 규칙 + 이력 + 성숙도
```

렌더러는 사실을 쓰지 않는다 — 우주의 실제 파일을 읽어 조립한다. **그래서 낡을 수 없다.**
