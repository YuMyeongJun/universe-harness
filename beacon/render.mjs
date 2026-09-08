#!/usr/bin/env node
/**
 * 전파 — 렌더. 우주의 **실제 상태를 읽어** 발행본을 조립한다.
 *
 * 한 장이 아니라 **기관별 페이지**로 낸다 — 우주의 구조가 위키에서도 보여야 한다.
 * 산출: `beacon/out/pages/{slug}.md` + `beacon/out/index.json`(발행기가 읽는 트리)
 *
 * ⛔ 여기에 사실을 적지 마라. 전부 파일에서 읽는다 — 그래야 발행본이 낡지 않는다.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rejectUnknownFlags } from '../lib/flags.mjs';

rejectUnknownFlags(process.argv.slice(2), ['--universe'], 'universe render');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'beacon/out/pages');

const fmOf = (t) => /^---\n([\s\S]*?)\n---/.exec(t)?.[1] ?? '';
const field = (t, k) => new RegExp(`^${k}:\\s*(.+)$`, 'm').exec(fmOf(t))?.[1]?.trim();
const list = (t, k) => (field(t, k) ?? '').replace(/^\[|\]$/g, '').split(',').map((s) => s.trim()).filter(Boolean);
const readJson = async (p) => JSON.parse(await fs.readFile(p, 'utf8'));
const exists = (p) => fs.stat(p).then(() => true).catch(() => false);

/** 문서의 본문에서 한 절만 떼어 온다 — 위키에 옮길 때 원문을 그대로 쓰기 위해. */
const section = (text, heading) => {
  const m = new RegExp(`\\n## ${heading}[^\\n]*\\n([\\s\\S]*?)(?=\\n## |$)`).exec(text);
  return m ? m[1].trim() : '';
};

const config = await readJson(path.join(root, 'universe.config.json'));
const today = new Date().toISOString().slice(0, 10);

const laws = await Promise.all(config.laws.map(async (name) => {
  const text = await fs.readFile(path.join(root, 'laws', `${name}.md`), 'utf8');
  return { name, text, title: field(text, 'title') ?? name, scope: field(text, 'scope') ?? 'meta',
           optIn: field(text, 'optIn') === 'true', rules: list(text, 'rules'),
           description: field(text, 'description') ?? '', applies: field(text, 'applies_to') ?? '' };
}));

const forceNames = (config.forces ?? ['observer']).filter(Boolean);
const forces = await Promise.all(forceNames.map(async (name) => {
  const p = path.join(root, 'forces', `${name}.md`);
  if (!(await exists(p))) { return null; }
  const text = await fs.readFile(p, 'utf8');
  return { name, text, title: field(text, 'title') ?? name, kind: field(text, 'kind') ?? '',
           triggers: list(text, 'triggers'), enforces: list(text, 'enforces'),
           description: field(text, 'description') ?? '' };
}));

const galaxyFiles = (await fs.readdir(path.join(root, 'galaxies'))).filter((f) => f.endsWith('.json'));
const galaxies = await Promise.all(galaxyFiles.map((f) => readJson(path.join(root, 'galaxies', f))));

const logFiles = (await fs.readdir(path.join(root, 'log'))).filter((f) => f.endsWith('.md') && f !== 'README.md').sort();
const rounds = await Promise.all(logFiles.map(async (f) => {
  const text = await fs.readFile(path.join(root, 'log', f), 'utf8');
  /* 판정만 뽑는다 — 근거는 저장소에 두고 위키에는 판정을 남긴다(아래 이력 표 주석). */
  const verdicts = [...(section(text, '평가') ?? '').matchAll(/^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/gm)]
    .map((m) => ({ axis: m[1].trim(), verdict: m[2].replace(/\*/g, '').trim() }))
    .filter((r) => r.axis && r.axis !== '축' && !/^-+$/.test(r.axis) && r.verdict && !/^-+$/.test(r.verdict));
  return { round: field(text, 'round') ?? '', title: field(text, 'title') ?? f,
           description: field(text, 'description') ?? '', verdicts, text };
}));

/* ⚠️ 라운드는 **파일명이 아니라 라운드 번호로** 줄 세운다.
   앞선 로그들이 실제 시각보다 앞선 이름을 갖고 있어서, 파일명 순으로는
   R06·R07 이 R04·R05 앞에 나왔다(실측). 같은 원인이 `round close` 가
   엉뚱한 라운드를 닫게 만들었다 — 이름은 순서의 근거가 못 된다. */
rounds.sort((a, b) => {
  const num = (r) => Number(/(\d+)/.exec(r.round)?.[1] ?? 999);
  return num(a) - num(b);
});

const meta = laws.filter((l) => l.scope === 'meta');
const matter = laws.filter((l) => l.scope === 'matter');
const banner = '> 이 페이지는 저장소에서 자동 생성된다 — `node beacon/render.mjs`. **위키를 고치지 말고 저장소를 고쳐라.** 정본은 저장소이고 이 페이지는 뷰다.';

/* ── 페이지들 ─────────────────────────────────────────────── */
const pages = [];
/* ⚠️ **강조가 인라인 코드를 감싸지 않게 쓴다.** 왕복 측정에서 드러났다 —
   Confluence 저장 포맷은 「강조 안의 코드」를 표현하지 못해 `**a `b`**` 를
   `**a** `b`` 로 **항상 쪼갠다.** 정규화로 흡수할 수도 있지만, 그 자리는
   **진짜 사람 수정이 가장 쉽게 숨는 곳**이라 소스에서 안 만드는 쪽이 안전하다. */
/* ⚠️ `head` 를 갈아 끼울 수 있게 열어 뒀다 — 손으로 쓴 장은 「자동 생성된다」가 **거짓**이라
   같은 머리말을 붙일 수 없다. 아래 「손으로 쓴 가이드」 절 참고. */
const add = (slug, title, body, head = banner) => pages.push({ slug, title, body: `${head}\n\n${body}\n\n---\n\n_발행 ${today} · 정본_ \`universe/\`` });

add('index', 'Universe — 프론트엔드 하네스', `# ${config.name} — v${config.version}

> ${config.description}

법칙 ${laws.length} · 힘 ${forces.filter(Boolean).length} · 은하 ${galaxies.length} · 라운드 ${rounds.length} · 관측소 ${config.observatory?.attached ? '연결됨' : '미연결'}

## 왜 정원이 아닌가

앞선 하네스들(카카시 하네스 · Blumn Enterprise Harness)은 **정원**이다 — 천천히 **가꾸는** 은유다.
이 우주는 **터져 나오는** 은유다. 하나의 사건(빅뱅)에서 별이 생긴다.

그리고 두 정원 모두 **형식만 검사하고 동작은 사람이 본다.**
이 우주에는 **관측소**가 있다 — 별이 실제로 도는지 기계가 잰다. 그것이 존재 이유다.

## 다섯 층

| 층 | 무엇인가 |
|----|----------|
| 🌌 우주 | 법칙이 적용되는 전체 |
| 💥 빅뱅 | 별을 태어나게 하는 명령 |
| 🌀 은하 | 법칙이 적용되는 저장소 하나 |
| ☀️ 태양계 | 하나의 중력에 묶인 기능 묶음 |
| ⭐ 별 | 산출물 하나 |

별의 주소는 세 마디다: \`은하/{repo} · 태양계/{묶음} · 별/{산출물}\`

## 빅뱅의 세 단계

| 단계 | 명령 | 무엇이 나오나 |
|------|------|---------------|
| 1차 | \`universe new <은하> <태양계> <별>\` | 법칙을 지키는 뼈대 + 관문 |
| 2차 | \`--expand\` | 게이트까지 돌고 빨간 축을 스스로 고친다 |
| 3차 | \`--from "<요구사항>"\` | **요구사항 한 줄에서 도는 화면까지** |

⚠️ 3차가 보장하는 것은 「요구사항을 반영했다고 주장하는 코드가 관문과 게이트를 지난다」까지다.
게이트가 재는 건 lint·build·test 이므로 **요구사항이 실제로 충족됐는지는 못 잰다.**

## 기관 — 자식 페이지

| 기관 | 무엇을 하나 |
|------|-------------|
| **법칙** | 우주를 지배하는 규칙. 문서가 아니라 **관문**이다 |
| **힘** | 실제로 일을 하는 것. 배달되지 않고 발견된다 |
| **관측소** | 별이 도는지 기계가 잰다 |
| **은하** | 법칙이 적용되는 저장소. 우주는 좌표만 들고 있다 |
| **성운** | 아직 법칙이 아닌 관측. 백로그 |
| **라운드** | 무엇을 했고 어떻게 평가했나 |

## 무엇이 배달되고 무엇이 안 되나

| | 배달되나 | 왜 |
|---|---|---|
| 법칙 | ✅ | 도메인에 매이지 않는다 — 어느 React 은하에나 통한다 |
| 관측소 | ✅ | 명령 이름만 설정으로 받는다 |
| 힘 | ❌ | 도메인에 매여 있다. 명부만 배달하고 실물은 은하마다 새로 쓴다 |
| 은하 좌표 · 성운 | ❌ | 은하의 것이다 |

## 그림은 저장소에 있다

배달 경계 · 빅뱅 3단계 시퀀스 · 관문과 게이트의 순서 · 폴더 구조는 저장소의
\`docs/08-architecture.md\` 에 있다.

⚠️ **이 위키에서는 그림이 안 보인다.** 재보고 적는다 —
mermaid 는 코드블록으로만 나오거나(마크다운 경로) 확장 오류가 나고(HTML 경로),
SVG 는 **첨부 업로드 도구가 없어** 올릴 방법이 없다(data URI 는 저장은 되지만 뷰어가 거부한다).
나중에 첨부 도구가 생기거나 이 스페이스의 다이어그램 확장이 고쳐지면 다시 잰다.

## 채택한 것 — 무에서 만들지 않았다

| 출처 | 무엇을 채택했나 |
|------|-----------------|
| **EnvHarness** (Google Research, Apache 2.0 · arXiv:2608.19880) | 얼어붙은 환경을 고치지 않고 감싸는 방식 · Setup / Rule / Link 3부품 |
| **Toss Frontend Fundamentals** | 물질 법칙 넷의 축 — 네이밍 · 평탄성 · 응집 · 파생 state |
| **카카시 하네스** (MIT) | 3층 구조 · 배포판=씨앗+절차 · 「로그에만 남은 제안은 실행되지 않는다」 |

**셋 모두 코드 복사가 아니라 설계 채택이다.** 관측 엔진은 자체 구현이다.`);

add('laws', '법칙 (Laws)', `# 법칙

법칙은 **읽으라고 있는 것이 아니라 막으라고** 있다.
별이 태어날 때 관측소가 이 법칙들로 검사하고, **하나라도 위반이면 별은 태어나지 않는다.**

## 메타 법칙 — 우주가 지킨다

| 법칙 | 한 줄 |
|------|-------|
${meta.map((l) => `| **${l.title}** | ${l.description} |`).join('\n')}

## 물질 법칙 — 별이 지킨다

| 법칙 | 규칙 | 적용 |
|------|------|------|
${matter.map((l) => `| **${l.title}**${l.optIn ? ' 🔒opt-in' : ''} | ${l.rules.length}개 — \`${l.rules.join('` `')}\` | ${l.applies} |`).join('\n')}

🔒 **opt-in 은 합의가 있을 때만 켠다.** 보편 규칙이 아니라 한 조직의 결정이므로,
합의 없는 은하에 걸면 관문이 헛돌고 **헛도는 관문은 별이 무시하는 법부터 배우게 한다.**

## 실측은 법칙에 적지 않는다

법칙은 은하를 모른다. 위반 건수는 은하의 것이고 \`observe.mjs\` 가 잰다.
**문서의 수치가 실측과 다르면 관측소가 exit 1 로 막는다** — 그것이 관측 법칙의 집행이다.

## 관측 법칙이 자란 자리

이 법칙의 조항은 전부 **실제로 당한 뒤에** 생겼다.

| 조항 | 무엇에 당했나 |
|------|---------------|
| §3 파이프 뒤에서 종료코드를 읽지 않는다 | \`lint | tail\` 의 \`$?\` 는 \`tail\` 의 것이라 **실패가 「0 error」로 보였다** |
| §4 걸러 본 출력으로 통과를 선언하지 않는다 | \`| grep ❌\` 가 조용한 것은 「위반 없음」이 아니라 **스크립트가 죽어 아무것도 못 셌을 때도** 똑같다 |
| §6 죽은 빌드 위의 수치는 전부 거짓이다 | boot build 가 \`exit 1\` 인데 브리핑이 「전부 초록불」이라 말하며 **LLM 을 14번 태웠다** |
| §7 모르는 입력을 삼키는 도구는 안 켜진 모드를 켜진 것처럼 보이게 한다 | 없는 플래그 \`--oracle\` 을 공짜 모드로 믿고 돌렸는데 파서가 삼켜 **유료 주행이 돌았다** |

## 새 법칙을 추가할 때

${section(await fs.readFile(path.join(root, 'laws/README.md'), 'utf8'), '새 법칙을 추가할 때')}`);

add('forces', '힘 (Forces)', `# 힘

> 법칙은 무엇이 옳은지 말하고, **힘은 그 일을 한다.**

우주에는 기본 힘이 넷뿐이다. 이 우주도 같다 — **다 넣지 않는다.**

## 힘은 배달되지 않는다

> 정원의 꽃은 배달되지 않는다 — 당신의 토양에서 피운다. **마더의 정의 파일을 복사해오는 것이 아니다.**
> — 카카시 하네스 영입 워크플로우

명부는 배달되지만 실물은 은하마다 새로 쓴다. 힘의 트리거가 그 은하의 어휘를 써야 발동하기 때문이다.

## 종류

| 종류 | 가진 것 | 하는 일 |
|------|--------|---------|
| \`fundamental\` | 우주 자체에 대한 권한 | 우주를 고친다 (메타) |
| \`specialist\` | 도구 · 도메인 지식 | 별을 점검·개선한다 |
| \`principle\` | 사상(思想) | 작업 방식 자체를 평가한다 |

## 지금 있는 힘

| 힘 | 종류 | 트리거 | 집행하는 법칙 |
|----|------|--------|--------------|
${forces.filter(Boolean).map((f) => `| **${f.title}** | \`${f.kind}\` | ${f.triggers.slice(0, 3).map((t) => `\`${t}\``).join(' ')} | ${f.enforces.join(' · ')} |`).join('\n')}

${forces.filter(Boolean).map((f) => `### ${f.title}\n\n${f.description}\n\n${section(f.text, '하지 않는 일') ? `**하지 않는 일**\n\n${section(f.text, '하지 않는 일')}` : ''}`).join('\n\n')}

## 발견 카탈로그

${section(await fs.readFile(path.join(root, 'forces/README.md'), 'utf8'), '발견 카탈로그 — 필요해지면 꺼낸다')}

## 발견 절차

${section(await fs.readFile(path.join(root, 'forces/README.md'), 'utf8'), '힘을 발견하는 절차 — 4파일')}`);

add('observatory', '관측소 (Observatory)', `# 관측소

> **형식이 아니라 동작을 잰다.**

앞선 두 정원은 frontmatter·필수 절 같은 **형식**을 lint 로 검사하고, 동작은 사람이 봤다.
그 대가가 기록으로 남아 있다 — 릴리스 가드가 낡아 운영 배포가 즉시 실패했고,
패키지 핀 간극으로 **6일간 설치가 조용히 깨져** 있었다. 형식 lint 는 그것을 못 잡는다.

## 다섯 장치

| 장치 | 무엇을 보나 | 언제 |
|------|------------|------|
| \`verify-laws.sh\` | **우주 자신의 형식** — frontmatter · 필수 절 · config 정합 | 우주를 고칠 때 |
| \`observe.mjs\` | **은하의 법칙 위반 수** + 문서 수치가 낡았는가 | 법칙을 고칠 때 |
| \`verify.mjs\` | **별이 도는가**(게이트) + **법칙을 지키는가**(관문) | 코드를 고친 뒤 |
| \`verify-links.mjs\` | **문서가 유령을 가리키는가** — 상대 링크가 실재하는가 | 문서를 고칠 때 |
| \`round audit\` | **루프가 새는가** — 로그의 낮은 축이 성운에 살아 있는가 | 라운드마다 |

⚠️ 뒤의 둘은 **실제로 샜기 때문에** 생겼다. 링크 검사는 벤더링 때 원본 저장소를 가리키던
링크 7건을 찾아냈고, 승격 감사는 **다른 작업에 덮여 성운에서 사라진 승격 4건**을 찾아냈다.

## 엔진

엔진은 \`fe-agent-harness\` — 3패키지다.

| 층 | 무엇 |
|----|------|
| 게이트 | lint(JSON 산출) · build · test · typecheck |
| 관문 Contract | 결정론 레인(정적 규칙) → 통과 시 판정 레인(LLM) |
| 스테이지 채점 | 샌드박스에 결함을 심고 고치게 한 뒤 잰다 |

## 지켜야 할 것

- **게이트는 중앙에서 한 번만.** 타입 인지 lint 저장소에서 동시 실행하면 10.3초 → 21분이 된다(실측).
- **게이트가 빨간불이면 채점하지 않는다.** 죽은 빌드 위의 수치는 전부 거짓이다.
- ⛔ **파이프 뒤에서 판정하지 마라** — \`lint | tail\` 은 실패를 「0 error」로 보이게 한다.
- ⛔ **모르는 입력을 조용히 삼키지 마라.** 없는 플래그 \`--oracle\` 을 「LLM 안 쓰는 모드」로
  믿고 돌렸는데 파서가 삼켜서 **유료 주행이 돌았다.** 비용을 기록하기 전까지 아무도 몰랐다.
- **자기가 쓴 자원을 기록한다.** 에피소드마다 LLM 호출 횟수와 비용을 궤적에 남긴다.
  한 호출이라도 보고가 없으면 합계를 \`null\` 로 떨어뜨린다 — 일부만 더한 수는 싸 보이는 거짓말이다.

## 왜 관문이 게이트보다 먼저인가

관문이 **싸기 때문**이다. 이름 하나 때문에 20분짜리 빌드를 돌릴 이유가 없다.
\`verify.mjs\` 는 변경된 파일만 관문에 걸고, 막히면 게이트를 아예 돌리지 않는다.`);

const galaxyBody = galaxies.length === 0
  ? `아직 등록된 은하가 없다. 이 배포판에는 은하가 들어 있지 않다 — **은하는 배달되지 않는다.**

## 은하를 등록하려면

\`galaxies/{name}.json\` 을 만든다. 우주는 별을 갖지 않고 **좌표만** 들고 있다(보존 법칙).

| 필드 | 무엇 |
|------|------|
| \`path\` | 저장소 절대경로 |
| \`appWorkspace\` · \`appDir\` | 앱 위치 |
| \`laws\` | 이 은하에서 켤 법칙 (opt-in 포함 여부) |
| \`commands\` | 은하의 **기존** 명령 이름. 우주는 코드를 고치지 않는다 |
| \`lintTargets\` | 게이트 통과 조건 = 여기 전부 0 error |
| \`thresholds\` | 광속 한계 — 깨끗한 상태 실측값 이상 |
| \`solarSystems\` | 태양계 목록 |

## 예시

도는 은하 하나가 저장소 \`fixtures/tiny-galaxy\` 에 있다 —
React 18 + Vite 6 + Vitest 3 + ESLint 9, 게이트 한 바퀴 **3.5~4.2초**.
엔진의 스테이지 네 개가 전부 이 은하에서 재현된다.

| 스테이지 | 결함 상태 | 고친 상태 |
|---|---|---|
| \`s01\` 번들 꼬임 | \`FAILED 0.78\` | \`SOLVED 0.96\` |
| \`s02\` SPA 딥링크 | — | \`SOLVED\` |
| \`s03\` 캐시 무효화 | \`FAILED 0.751\` | \`SOLVED 0.96\` |
| \`s04\` 토스 품질 | — | **에이전트 1회** \`SOLVED 0.81\` |

**「결함에서 ❌ · 고침에서 ✅」를 양쪽 다 확인했다** — 한쪽만 보면
「항상 통과」와 「항상 실패」를 못 가른다.

**법칙 문서에는 수치가 없다** — 수치는 은하의 것이고 \`observe.mjs\` 가 잰다.`
  /* ⚠️ 이름·설명이 없는 은하 파일은 **건너뛴다.** 예전엔 그대로 찍어서
     위키에 `## undefined` 와 `undefined` 한 줄이 나갔다 — 갈래가 시험용으로 잠깐 만들었다
     지운 `galaxies/_test-*.json` 이 그 순간의 렌더에 잡힌 것이었다.
     발행본은 사람이 읽는 것이므로, 못 읽을 것은 내보내지 않고 **왜 뺐는지** 적는다. */
  : (() => {
      const usable = galaxies.filter((g) => g && g.name && g.description);
      const skipped = galaxies.length - usable.length;
      const body = usable.map((g) => `## ${g.name}\n\n${g.description}\n\n| 축 | 값 |\n|----|-----|\n| 켜진 법칙 | ${(g.laws ?? []).join(' · ')} |\n| 태양계 | ${(g.solarSystems ?? []).map((s) => s.name).join(' · ')} |`).join('\n\n');
      return skipped > 0
        ? `${body}\n\n⚠️ 이름이나 설명이 없는 은하 파일 ${skipped}개는 뺐다(\`galaxies/*.json\` 을 보라).`
        : body;
    })();
add('galaxies', '은하 (Galaxies)', `# 은하\n\n> 별은 은하에 산다. **우주는 주소만 들고 있다.**\n\n${galaxyBody}`);

/* ⚠️ 성운 페이지가 **배포판 템플릿**을 보여 주고 있었다 — 조건이 `galaxies.length === 0`
   이라 은하가 없으면 이 우주의 실제 성운 대신 「이 배포판에는 없다」가 나갔다.
   위키는 이 우주의 상태를 보는 창이다. 정본(`nebula/README.md`)에서 읽어 온다.
   닫힌 항목(✅ 닫힘)은 세기만 하고 목록에서 뺀다 — 위키에 보여야 할 것은 **열린 것**이다. */
const nebulaBody = await (async () => {
  const text = await fs.readFile(path.join(root, 'nebula/README.md'), 'utf8').catch(() => '');
  const rows = text.split('\n').filter((line) => /^\|/.test(line) && !/^\|\s*-+/.test(line));
  const isHeader = (line) => /관측\s*\|/.test(line) || /무엇을 봤나/.test(line);
  const body = rows.filter((line) => !isHeader(line));
  const closed = body.filter((line) => line.includes('닫힘'));
  const open = body.filter((line) => !line.includes('닫힘'));
  /* ⚠️ 정본에 표가 있는데 한 줄도 못 뽑았으면 **추출이 고장 난 것**이다.
     예전에 이 자리가 조건을 잘못 잡아 배포판 템플릿을 위키로 내보낸 적이 있다. */
  if (body.length === 0 && /^\|/m.test(text)) {
    throw new Error('성운 정본에 표가 있는데 한 줄도 못 뽑았다 — 추출이 고장 났다.');
  }
  if (open.length === 0) {
    return '(지금은 비어 있다.)';
  }
  return [
    `열린 것 **${open.length}건**${closed.length ? ` · 닫힌 것 ${closed.length}건은 뺐다` : ''}`,
    '',
    '| 관측 | 출처 | 왜 아직 법칙이 아닌가 |',
    '|------|------|----------------------|',
    ...open,
  ].join('\n');
})();

add('nebula', '성운 (Nebula)', `# 성운

> 아직 별이 아닌 것. **관측은 됐는데 법칙이 없는 것들**이 여기 떠 있다.

성운은 백로그다. 다만 아이디어 창고가 아니라 **관측된 것만** 들어온다.
법칙이 되면 법칙으로 나가고, 별이 되면 은하로 나간다.

⛔ **여기 쌓아 두기만 하지 않는다.** 실행할 것은 법칙으로 승격시킨다 —
성운에만 남은 제안은 실행되지 않는다.

## 형식

| 관측 | 실측 | 왜 아직 법칙이 아닌가 |
|------|-----:|----------------------|
| 무엇을 봤나 (\`규칙-id\` 는 백틱으로) | 수 또는 \`미측정\` | 법칙이 되려면 무엇이 더 필요한가 |

⚠️ **규칙 id 를 백틱으로 적어야** \`observe.mjs\` 의 커버리지 검사가 인식한다.
주인 없는 규칙이 법칙에도 성운에도 없으면 검사가 \`exit 1\` 을 낸다.

## 지금 떠 있는 것

${nebulaBody}`);

add('rounds', '라운드 (Rounds)', `# 라운드

라운드마다 무엇을 했고 어떻게 평가했는지 남긴다. **평가 없는 라운드는 불완전한 실행이다.**

## 평가 규칙

- **축 / 판정 / 근거** 표로 쓴다. 근거 없는 등급은 무효다.
- **합성 등급 금지** — 여러 축을 "종합 B+" 로 합치지 않는다.
- **정직성 축을 포함한다** — 안 한 것을 안 했다고 적었는가.

## 이력

| # | 무엇을 했나 | 판정 |
|---|-------------|------|
${(() => {
  /* ⚠️ **한 줄씩이라 천천히 는다는 짐작이 틀렸다.** 한글은 UTF-8 에서 글자당 3바이트라
     제목+설명 한 줄이 **약 250바이트**다. R38 시점에 이력 표만 9.5KB 였고 페이지가 13KB —
     12KB 한계를 넘고 있었는데 `universe beacon` 이 **관문 목록에 없어서** 아무도 몰랐다.
     ⇒ 최근 것은 설명까지, 옛것은 제목만. 정본은 저장소 `log/` 다. */
  /* ⚠️ **고정 개수는 라운드가 늘면 또 넘는다.** R55 에서 10개로 잘랐는데 R62 에 다시 12KB 를
     넘었다 — 일곱 바퀴 만이다. 고정 수를 다시 고르면 일곱 바퀴 뒤에 또 온다.
     ⇒ **크기에 맞춰 스스로 준다**: 예산 안에 들어갈 만큼만 설명을 싣는다.
     ⚠️ **판정은 옛 라운드도 싣는다** — 평가표 전문을 잘라 냈더니 위키만 보는 사람은
     옛 바퀴를 어떻게 평가했는지 아무것도 못 보게 됐다(R19·R39·R40). 한 바퀴당 약 45바이트다. */
  /**
   * ⚠️⚠️ **세 번째 판이다.** R55 는 개수로, R62 는 설명 증분으로 잘랐는데 R79 에 또 넘었다 —
   * **이력 줄 자체가 바퀴마다 약 90바이트씩** 늘기 때문이다(79바퀴에 7.1KB).
   * 예산을 어떻게 나눠도 **줄 수가 늘면 결국 넘는다.**
   * ⇒ **세 단계로 접는다.** 판정은 **전부** 남기고(R40 이 지킨 것), 옛 바퀴는 제목까지 접는다.
   *   가장 오래된 것부터 잃는 것이 순서다 — 최근 것이 더 자주 읽힌다.
   */
  const PAGE_BUDGET = 6800;
  const verdictsOf = (r) => r.verdicts.map((v) => v.verdict).join(' · ') || '—';
  const tiny = (r) => `| **${r.round}** | | ${verdictsOf(r)} |`;
  const brief = (r) => `| **${r.round}** | ${r.title} | ${verdictsOf(r)} |`;
  const full = (r) => `| **${r.round}** | **${r.title}** — ${r.description} | ${verdictsOf(r)} |`;
  const size = (s) => Buffer.byteLength(s, 'utf8');
  const chosen = new Map(rounds.map((r) => [r.round, tiny(r)]));
  let spent = rounds.reduce((sum, r) => sum + size(tiny(r)) + 1, 0);
  /* 최근 것부터 살을 붙인다 — 제목 먼저 전부, 그다음 설명. */
  for (const step of [brief, full]) {
    for (const r of [...rounds].reverse()) {
      const grow = size(step(r)) - size(chosen.get(r.round));
      if (grow <= 0 || spent + grow > PAGE_BUDGET) { continue; }
      spent += grow;
      chosen.set(r.round, step(r));
    }
  }
  return rounds.map((r) => chosen.get(r.round)).join('\n');
})()}

${(() => {
  /* ⚠️ **위키는 뷰지 보관소가 아니다.** 평가표 전문을 라운드마다 쌓으면 이 페이지는
     라운드당 약 1.3KB 씩 무한히 자란다(R17 에서 이미 22.6KB — 발행본 7장 합계의 절반).
     R40 이면 53KB, R60 이면 80KB 다. 그쯤 되면 **아무도 안 읽는다.**
     이력 표는 전부 남기고(한 줄씩이라 천천히 는다), **평가표 전문은 최근 것만** 싣는다.
     옛것은 저장소 `log/` 에 그대로 있다 — 정본은 저장소다. */
  /* ⚠️⚠️ **고정 개수도, 증분 예산도 부족했다.** R55 가 10개로 잘랐고 R62 가 설명 증분을
     예산에 묶었는데 R79 에 **또 12KB 를 넘었다** — 이력 표의 **기본 줄**이 바퀴마다 늘기 때문이다.
     ⇒ **평가표 전문도 예산에 넣는다.** 페이지에 남은 자리만큼만 최근 것부터 싣는다.
     옛것은 저장소 `log/` 에 그대로 있다 — 정본은 저장소다. */
  const DETAIL_BUDGET = 3200;
  const width = (s) => Buffer.byteLength(s, 'utf8');
  const blocks = [];
  let spentDetail = 0;
  for (const r of [...rounds].reverse()) {
    const ev = section(r.text, '평가');
    if (!ev) { continue; }
    const block = `### ${r.round} — ${r.title}\n\n${ev}`;
    if (spentDetail + width(block) > DETAIL_BUDGET) { break; }
    spentDetail += width(block);
    blocks.unshift(block);
  }
  const detail = blocks.join('\n\n');
  const hidden = rounds.length - blocks.length;
  const note = hidden > 0
    ? `> 평가표 전문은 **페이지에 남는 자리만큼만** 싣는다(지금 ${blocks.length}바퀴). 앞의 ${hidden}바퀴는\n> 저장소 \`log/\` 에 그대로 있다 — **정본은 저장소다.**\n\n`
    : '';
  return `${note}${detail}`;
})()}`);

/* ── 손으로 쓴 가이드 — `docs/wiki/` 를 **읽어서** 싣는다 ──────
 *
 * ⛔⛔ **본문을 여기 다시 쓰지 않는다.** 위의 일곱 장은 저장소 상태에서 **조립되는** 것이라
 * 낡을 수가 없지만, 사용 가이드는 **사람이 쓴 글**이라 조립할 수가 없다. 그렇다고 본문을
 * 이 파일에 옮겨 적으면 정본이 둘이 되고, **한 자리만 고쳐진다** — 이 저장소가 반복해서
 * 겪은 그 사고다. ⇒ 정본은 `docs/wiki/` 고 여기서는 **읽어서 나른다.**
 *
 * ⚠️ **frontmatter 는 떼고 싣는다.** 저장소의 문서 법칙이 `name`·`title`·`type`·`description`
 *    을 요구하는데(`universe laws`), 그 블록이 위키에 그대로 나가면 **본문 글자로 보인다.**
 *    제목은 그 frontmatter 에서 읽는다 — 여기 손으로 적으면 그것도 두 벌이 된다.
 *
 * ⛔ `README.md` 는 안 싣는다. 그건 **폴더 안내**(무엇이 왜 여기 있나)라 위키 독자의 것이 아니다.
 *
 * ⚠️ 줄 세우기는 **슬러그 사전순**이다. `readdir` 순서는 기계마다 달라서 그대로 쓰면
 *    발행본이 기계마다 달라진다(= `verify-beacon` 이 「낡았다」로 읽는다).
 *    슬러그로 세우면 `guide` 가 `guide-…` 앞에 와서 **첫 장이 먼저** 오기도 한다.
 */
const guideDir = path.join(root, 'docs/wiki');
const guideFiles = (await fs.readdir(guideDir).catch(() => []))
  .filter((f) => f.endsWith('.md') && f !== 'README.md')
  .map((f) => ({ file: f, slug: f.replace(/\.md$/, '') }))
  .sort((a, b) => (a.slug < b.slug ? -1 : 1));

/* ⛔ 「자동 생성된다」고 적을 수 없다 — 이 장들은 사람이 쓴 것이다. 그래도 **방향은 같다**:
   위키는 뷰고 정본은 저장소다. 그 한 줄이 없으면 다음 사람이 위키에서 고친다. */
const guideBanner = '> 이 페이지의 정본은 저장소의 `docs/wiki/` 다 — **위키를 고치지 말고 저장소를 고쳐라.** 위키에는 diff·리뷰·롤백이 없고, 무엇보다 관문으로 집행할 수 없다.';

for (const { file, slug } of guideFiles) {
  const raw = await fs.readFile(path.join(guideDir, file), 'utf8');
  const title = field(raw, 'title');
  /* ⛔ 제목을 못 읽었으면 **슬러그로 때우지 않는다** — 그러면 위키에 `guide-not-yet` 이라는
     제목이 조용히 걸린다. 못 읽은 것은 못 읽었다고 말하고 죽는다. */
  if (!title) {
    console.error(`⛔ docs/wiki/${file} — frontmatter 에 title 이 없다. 위키 제목을 지어내지 않는다.`);
    process.exit(1);
  }
  add(slug, title, raw.replace(/^---\n[\s\S]*?\n---\n*/, '').trim(), guideBanner);
}

await fs.rm(path.join(root, 'beacon/out'), { recursive: true, force: true });
await fs.mkdir(outDir, { recursive: true });
for (const p of pages) {
  await fs.writeFile(path.join(outDir, `${p.slug}.md`), p.body, 'utf8');
}
await fs.writeFile(
  path.join(root, 'beacon/out/index.json'),
  JSON.stringify({ generated: today, parent: 'index', pages: pages.map(({ slug, title }) => ({ slug, title })) }, null, 2),
  'utf8',
);
console.log(`렌더 완료 — 페이지 ${pages.length}장`);
for (const p of pages) { console.log(`  ${p.slug.padEnd(12)} ${p.title}`); }
