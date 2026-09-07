/**
 * Stage 01 — `"use client"` 경계가 잘못돼 서버 몫 모듈이 클라이언트 번들에 들어간다.
 *
 * **이것이 Next 에서 「초록불인데 틀린」 대표 자리다.** 빌드도 린트도 타입체크도 통과한다.
 * 틀린 것은 산출물의 모양이고, 그것은 소스만 봐서는 안 보인다.
 *
 * 근거(지어낸 결함이 아니다 · Next 공식 문서):
 *   · "Once a file is marked with `"use client"`, **all of its imports** and the components it
 *      directly renders are included in the client bundle."
 *   · "JavaScript modules can be shared between both Server and Client Components modules.
 *      This means it's possible to **accidentally import server-only code into the client**."
 *   · "only environment variables prefixed with `NEXT_PUBLIC_` are included in the client bundle.
 *      If variables are not prefixed, Next.js **replaces them with an empty string**. As a result,
 *      even though `getData()` can be imported and executed on the client, **it won't work as
 *      expected**." — https://nextjs.org/docs/app/getting-started/server-and-client-components
 *
 * ⚠️ 그래서 이 스테이지가 가르치는 것은 「비밀값이 브라우저로 샌다」가 **아니다.**
 *    ① 서버에서만 돌 생각으로 쓴 **코드가** 브라우저로 가고,
 *    ② 자격 증명 자리는 빈 문자열이 되어 **조용히 잘못 돈다.**
 *    둘 다 빌드 초록불 아래에서 일어난다.
 *
 * ⚠️ `server-only` 패키지로 막을 수 있지만 **설치를 전제하지 않는다** — 그것은 소비 저장소의
 *    의존성을 바꾸는 일이고(이 엔진의 원칙 위반), Next 문서도 설치를 optional 이라고 적는다.
 *    채점은 **산출물**로 한다.
 *
 * 재는 법: `<distDir>/static/chunks/**` 에서 서버 몫 모듈의 고유 문자열을 찾는다.
 *   · 결함 상태 → 있다 (모듈이 클라이언트 그래프에 들어갔다)
 *   · 고친 상태 → 없다 (서버가 읽어 **직렬화 가능한 props** 로 내려줬다)
 * 고친 뒤 그 값이 필요하면 RSC 페이로드(HTML 안)로 가지, `static/chunks` 로는 가지 않는다.
 */
import path from 'node:path';

import type { IStageDefinition, IStageIO, ISignal } from '@core/fe-agent-harness';

import { findMarker, formatHits, readClientBundle, walkFiles } from '../output.ts';
import { inApp, seedRoutePath, seedRouteUrl } from '../paths.ts';
import type { INextPaths } from '../paths.ts';

/**
 * 클라이언트 번들에서 찾을 고유 문자열.
 * ⚠️ **반환값에 실리는 문자열**이어야 한다. 아무도 안 쓰는 상수는 번들러가 흔들어 털어내고,
 *    그러면 결함이 재현되지 않은 채 「통과」가 나온다(= 지어낸 지식).
 */
const LEDGER_MARKER = 'ledger.internal.harness-invalid';

const BUTTON_LABEL = '정산 요약 불러오기';

const SEEDED_GATEWAY = `/**
 * 서버에서만 돌 생각으로 쓴 모듈이다.
 * ⚠️ 「생각」은 경계가 아니다 — Next 에서 경계를 만드는 것은 \`"use client"\` 하나뿐이다.
 */
export const LEDGER_ENDPOINT = 'https://${LEDGER_MARKER}/v1/summary';

export interface ILedgerSummary {
  source: string;
  total: number;
  isAuthorized: boolean;
}

export const readLedgerSummary = (): ILedgerSummary => {
  /* 접두사 없는 환경변수 — 서버에서만 값이 있다. 클라이언트 번들에서는 빈 문자열로 치환된다. */
  const token = process.env.LEDGER_API_TOKEN ?? '';

  return {
    source: LEDGER_ENDPOINT,
    total: (token.length + 1) * 42,
    isAuthorized: token.length > 0,
  };
};
`;

const SEEDED_PANEL = `'use client';

import { useState } from 'react';

import { readLedgerSummary } from './ledgerGateway';

export const ReceiptPanel = () => {
  const [summary, setSummary] = useState<{ total: number; isAuthorized: boolean } | null>(null);

  return (
    <section aria-label="정산 요약">
      <button type="button" onClick={() => setSummary(readLedgerSummary())}>
        ${BUTTON_LABEL}
      </button>
      {summary === null ? null : (
        <p>
          합계 {summary.total} · 인증 {summary.isAuthorized ? '됨' : '안 됨'}
        </p>
      )}
    </section>
  );
};
`;

const SEEDED_PAGE = `import { ReceiptPanel } from './ReceiptPanel';

const HarnessLedgerPage = () => (
  <main>
    <h1>정산 요약</h1>
    <ReceiptPanel />
  </main>
);

export default HarnessLedgerPage;
`;

export const createStage01 = (paths: INextPaths): IStageDefinition => {
  const routeDir = seedRoutePath(paths);
  const pagePath = `${routeDir}/page.tsx`;
  const panelPath = `${routeDir}/ReceiptPanel.tsx`;
  const gatewayPath = `${routeDir}/ledgerGateway.ts`;

  return {
    id: 's01-use-client-boundary',
    title: '`"use client"` 경계와 클라이언트 번들',
    intent:
      '빌드가 초록불인 채로 서버 몫 모듈이 클라이언트 번들에 들어간 상태를 재현하고, 산출물에서 그것을 증명해 경계를 옮겨 고친다.',
    /* React+Vite s01 의 실측을 그대로 따른다: 도구 없이 probe 로만 조사하면 원인 규명에만
       7스텝이 든다. patch·submit 자리를 남기려면 14 가 필요하다. */
    maxSteps: 14,
    contractLanes: { quality: true, typeSafety: true, a11y: false, tailwind: false, delivery: false },

    setup: async (io: IStageIO) => {
      /* ⛔ 라우트를 심을 자리가 없으면 **아무것도 만들지 않고 멈춘다.** 엉뚱한 곳에 심으면
         빌드가 깨지거나, 더 나쁘게는 아무 데도 안 걸린 채 「위반 0건」이 나온다. */
      if (!(await io.exists(inApp(paths, paths.appRouterDir)))) {
        throw new Error(
          [
            `App Router 루트를 못 찾았다: ${inApp(paths, paths.appRouterDir)}`,
            '`project.appRouterDir` 을 실제 자리(`app` 또는 `src/app`)로 맞춰라.',
            'Pages Router 전용 저장소라면 이 스테이지는 걸지 마라 — 서버 컴포넌트 경계가 없다.',
          ].join('\n'),
        );
      }

      await io.write(gatewayPath, SEEDED_GATEWAY);
      await io.write(panelPath, SEEDED_PANEL);
      await io.write(pagePath, SEEDED_PAGE);
    },

    briefing: async () => `
보안 점검 지적: "\`${seedRouteUrl(paths)}\` 화면을 브라우저에서 열고 받은 JS 를 뒤졌더니
**서버에서만 돌아야 할 정산 게이트웨이 코드가 그대로 들어 있다.**"

- 게이트는 전부 초록불이다(린트 · 빌드 · 유닛 테스트). 소스만 봐서는 안 보인다.
- 산출은 \`${inApp(paths, paths.buildOutputDir)}/\` 다.
  브라우저로 나가는 것은 \`${paths.clientChunksDir}/\` 아래이고, 서버 몫은 \`${paths.serverOutputDir}/\` 아래다.
- 관련 파일 셋: \`${pagePath}\` · \`${panelPath}\` · \`${gatewayPath}\`

지켜야 할 것:
1. \`${panelPath}\` 는 **계속 클라이언트 컴포넌트여야 한다** — 버튼을 눌러 상태가 바뀌는 화면이다.
2. \`${gatewayPath}\` 의 내용을 지우지 마라. 그 계산은 **서버에서** 그대로 돌아야 한다.
3. 버튼 문구 \`${BUTTON_LABEL}\` 는 그대로 둔다. 규칙을 만족시키려고 기능을 지우지 마라.

⛔ 게이트를 네가 반복해서 돌리지 마라 — 러너가 중앙에서 돌린다.
   조사에는 이미 만들어진 \`${inApp(paths, paths.buildOutputDir)}/\` 를 읽어라.
   힌트: 클라이언트 번들에 무엇이 들었는지는 \`grep -rl\` 로 셀 수 있다.
`,

    verify: async (io: IStageIO): Promise<ISignal[]> => {
      const outputRoot = path.join(io.root, inApp(paths, paths.buildOutputDir));
      const bundle = await readClientBundle(outputRoot, paths.clientChunksDir);
      const clientHits = await findMarker(bundle.files, LEDGER_MARKER);

      const serverFiles = (await walkFiles(path.join(outputRoot, paths.serverOutputDir))).filter((file) =>
        file.endsWith('.js'),
      );
      const serverHits = await findMarker(serverFiles, LEDGER_MARKER);

      const panel = await io.read(panelPath).catch(() => '');

      return [
        /* ⚠️ 이 신호가 **맨 앞**에 있어야 한다. 청크를 0개 훑고 「마커 0건」을 내는 것은
           통과가 아니라 아무것도 재지 못한 것이다. 그 실패는 초록불로 보인다. */
        {
          name: '클라이언트 번들을 실제로 훑었다',
          ok: bundle.files.length > 0,
          measured: `청크 ${bundle.files.length}개 · ${(bundle.totalBytes / 1024).toFixed(0)}KB`,
          detail:
            bundle.files.length > 0
              ? ''
              : `${path.join(inApp(paths, paths.buildOutputDir), paths.clientChunksDir)} 가 비었다 — 산출 경로 설정(project.buildOutputDir)이 틀렸다. 이 상태의 아래 신호는 전부 의미가 없다.`,
        },
        {
          name: '서버 몫 모듈이 클라이언트 번들에 없다',
          ok: bundle.files.length > 0 && clientHits.length === 0,
          measured: `마커 ${clientHits.length}개 청크 / 훑은 청크 ${bundle.files.length}개`,
          detail: clientHits.length === 0 ? '' : formatHits(clientHits, outputRoot),
        },
        {
          name: '서버 산출에는 그대로 남아 있다',
          ok: serverHits.length > 0,
          measured: `마커 ${serverHits.length}개 파일 / 훑은 서버 파일 ${serverFiles.length}개`,
          detail:
            serverHits.length > 0
              ? ''
              : '게이트웨이를 지워서 통과시키는 것은 통과가 아니다 — 그 계산은 서버에서 계속 돌아야 한다.',
        },
        {
          name: '패널은 여전히 클라이언트 컴포넌트다',
          ok: /^\s*['"]use client['"]/.test(panel) && /useState\s*[(<]/.test(panel),
          detail: '버튼을 눌러 상태가 바뀌는 화면이다. 서버 컴포넌트로 바꾸는 것은 기능을 지우는 것이다.',
        },
        {
          name: '버튼 문구가 남아 있다',
          ok: panel.includes(BUTTON_LABEL),
          detail: '규칙을 만족시키려고 화면을 지우지 마라.',
        },
      ];
    },
  };
};
