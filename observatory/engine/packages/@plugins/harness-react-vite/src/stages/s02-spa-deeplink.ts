/**
 * Stage 02 — S3 + CloudFront SPA 딥링크.
 *
 * 이 결함은 **주입하지 않는다.** 이미 저장소에 있는 상태다 — CloudFront 형상이 코드로
 * 남아 있지 않고, 딥링크 폴백 규칙이 어디에도 선언돼 있지 않다. 스테이지가 하는 일은
 * "그 형상을 파일로 만들어 놓고 지금 값을 그대로 적어 두는 것" 뿐이다.
 *
 * 실제 사고 근거: `/demo/` 는 S3 에 **객체가 없다**(S3 에 디렉터리는 없다). 「기본 루트 객체」로는
 * 못 고친다 — 그것은 배포 루트에만 듣는다.
 *
 * 함정: 403 → `/index.html` 200 으로 통째로 매핑하면 딥링크는 살지만 **없는 자산까지 200 + HTML**
 * 이 된다. 그러면 낡은 index 가 가리키는 사라진 청크가 "성공"으로 보이고, 브라우저는 JS 대신
 * HTML 을 실행하려다 흰 화면이 된다. verify 가 그 함정을 판정한다.
 */
import path from 'node:path';

import type { IStageDefinition, IStageIO, ISignal } from '@core/fe-agent-harness';

import { loadCloudFrontConfig, VIEWER_FUNCTION_NAMES } from '../aws/loadConfig.ts';
import { createDistribution } from '../aws/simulate.ts';
import { cloudfrontConfigPath } from '../paths.ts';
import type { IReactVitePaths } from '../paths.ts';

const SEEDED_CONFIG = {
  _comment:
    '지금 CloudFront 에 실제로 걸려 있는 값을 코드로 옮긴 것이다. 콘솔에서만 바꾸면 다음 사람이 이유를 모른다.',
  originIsWebsiteEndpoint: false,
  defaultRootObject: 'index.html',
  customErrorResponses: [],
  viewerRequestFunction: 'none',
};

export const createStage02 = (paths: IReactVitePaths): IStageDefinition => {
  const configPath = cloudfrontConfigPath(paths, 'dev');

  return {
    id: 's02-spa-deeplink',
    title: 'S3/CloudFront 딥링크 폴백',
    intent: '정적 오리진에는 디렉터리가 없다는 사실에서 나오는 SPA 404 를, 자산 404 를 가리지 않는 방식으로 고친다.',
    maxSteps: 8,
    contractLanes: { quality: false, typeSafety: false, a11y: false, tailwind: false, delivery: true },

    setup: async (io: IStageIO) => {
      await io.write(configPath, `${JSON.stringify(SEEDED_CONFIG, null, 2)}\n`);
    },

    briefing: async (io: IStageIO) => {
      /* ⚠️ **없는 파일을 가리키지 않는다.** 실제 에피소드에서 에이전트가
         `.github/workflows/deploy.yml` 을 찾느라 probe 를 **네 번** 태웠다 —
         그 파일은 이 은하에 없는데 브리핑이 「가진 것」으로 적었다. */
      const hasWorkflow = await io.exec(`test -f ${paths.deployWorkflow}`).then((r) => r.code === 0).catch(() => false);
      return `
운영 신고 두 건:
1. 사용자가 \`${paths.deepLinks[0] ?? '/<딥링크>'}\` 링크를 **직접 열면** 404 다. 앱 안에서 이동하면 멀쩡하다.
2. \`/demo/\`(스토리북)도 404 다. \`/demo/index.html\` 은 열린다.

가진 것:
- \`${configPath}\` — CloudFront 형상을 코드로 옮긴 파일. 지금 값은 콘솔의 현재 상태다.
${hasWorkflow ? `- \`${paths.deployWorkflow}\` — 실제 배포 스텝.` : '- (배포 워크플로 파일은 이 은하에 없다 — 찾지 마라.)'}
- 오리진은 S3 **REST 엔드포인트 + OAC** 다(정적 웹사이트 호스팅이 아니다).

⚠️ \`customErrorResponses\` 는 두 이름을 다 받는다 —
   \`{ from, to, status }\` 또는 AWS 이름 \`{ errorCode, responsePagePath, responseCode }\`.
   못 읽은 항목은 조용히 버리지 않고 빨간 축으로 알려 준다.

⚠️ \`viewerRequestFunction\` 은 **이름만** 받는다(임의 JS 코드가 아니다).
   가능한 값: ${VIEWER_FUNCTION_NAMES.map((n) => `\`${n}\``).join(' · ')}
   판정이 결정론이어야 하므로 시뮬레이터가 아는 이름만 해석한다.

⚠️ 딥링크만 고치고 끝내지 마라. 채점은 **없는 자산 요청**도 같이 본다 —
   \`/assets/does-not-exist.js\` 가 200 + HTML 로 돌아오면 그것은 고친 것이 아니라 가린 것이다.
`;
    },


    parses: [configPath],
    verify: async (io: IStageIO): Promise<ISignal[]> => {
      const config = await loadCloudFrontConfig(path.join(io.root, configPath));
      /* 형상을 못 읽은 사유는 **빨간 축 하나**로 만들고 나머지는 계속 잰다.
         터뜨리면 다른 축을 하나도 못 보고 「채점이 터졌다」만 남는다. */
      const configSignals: ISignal[] = config.rejected
        ? [{ name: 'CloudFront 형상을 읽을 수 있다', ok: false, measured: config.rejected }]
        : [];
      const distribution = createDistribution(config);
      await distribution.sync(path.join(io.root, paths.distDir), {
        deleteRemoved: true,
        cacheControl: 'no-cache',
        exclude: [],
      });
      /* 스토리북 산출은 별도 sync 로 `demo/` 아래 올라간다(워크플로와 같은 모양) */
      await distribution
        .sync(path.join(io.root, paths.storybookDistDir), {
          deleteRemoved: true,
          cacheControl: 'no-cache',
          exclude: [],
          prefix: 'demo',
        })
        .catch(() => undefined);

      if (paths.deepLinks.length === 0) {
        return [
          {
            name: '딥링크 목록',
            ok: false,
            measured: '비어 있음',
            detail: 'fe-harness.config.json 의 `project.deepLinks` 를 앱 라우트로 채워라 — 목록이 없으면 이 스테이지는 아무것도 재지 못한다.',
          },
        ];
      }

      const signals: ISignal[] = [...configSignals, ...paths.deepLinks.map((route) => {
        const response = distribution.request(route);
        const servesApp = response.status === 200 && /<div id="root"|<script/.test(response.body);
        return {
          name: `딥링크 ${route}`,
          ok: servesApp,
          measured: `${response.status}`,
          detail: servesApp ? '' : '정적 오리진에는 이 키가 없다. 폴백 규칙이 필요하다.',
        };
      })];

      const missingAsset = distribution.request('/assets/does-not-exist.js');
      signals.push({
        name: '없는 자산은 여전히 실패한다',
        ok: missingAsset.status !== 200,
        measured: `${missingAsset.status}`,
        detail:
          missingAsset.status === 200
            ? '자산 404 를 index.html 200 으로 가렸다 — 낡은 index 가 가리키는 사라진 청크가 "성공"으로 보이고 흰 화면이 된다.'
            : '',
      });

      const realAsset = [...distribution.bucket.keys()].find((key) => key.startsWith('assets/') && key.endsWith('.js'));
      if (realAsset) {
        const response = distribution.request(`/${realAsset}`);
        signals.push({
          name: '실제 자산은 그대로 200',
          ok: response.status === 200 && !/<div id="root"/.test(response.body),
          measured: `${response.status}`,
        });
      }

      return signals;
    },
  };
};
