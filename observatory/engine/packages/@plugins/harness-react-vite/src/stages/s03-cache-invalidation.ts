/**
 * Stage 03 — 배포 캐싱: 낡은 index.html × `--delete`.
 *
 * 실측 사례(whitehole-front · 2026-09-04) — 이 결함은 흔하다:
 *   - dev/stage: `aws s3 sync ./dist s3://... --delete --cache-control "no-cache"`
 *   - prod:      `aws s3 sync ./dist s3://... --delete`   ← cache-control 이 **없다**
 *   - 무효화:    `PATH_TO_INVALIDATE: /*`
 *
 * 두 가지가 동시에 틀려 있다:
 *   (a) 해시가 붙은 `assets/(해시)` 까지 `no-cache` → CDN 을 껐다. 매 요청이 오리진까지 간다.
 *   (b) prod 는 cache-control 을 아예 안 줘서 엣지 기본 TTL 을 탄다. 그런데 `--delete` 가
 *       낡은 청크를 지우므로, 엣지가 물고 있는 낡은 index.html 이 **없어진 청크**를 가리킨다.
 *       무효화가 늦거나 실패하면 그 창 동안 흰 화면이다.
 *
 * 채점은 시뮬레이터 위에서 **두 번 배포**해 재현한다.
 *
 * ⚠️ 2026-09-04 실측(픽스처 은하): `setup()` 이 CloudFront 형상(`configPath`)만 심고
 *    **배포 워크플로(`paths.deployWorkflow`)는 심지 않았다.** 이 스테이지가 결함으로 삼는
 *    바로 그 파일을 스스로 만들지 않은 것이다 — 이 은하처럼 `.github/workflows/deploy.yml`
 *    이 아예 없는 저장소에서는 `verify()` 의 `readDeployIntent()` 가 **catch 없이** ENOENT 를
 *    던졌다. (`ReactViteHarness.simulateDelivery` 는 같은 호출을 `.catch(() => null)` 하는데
 *    스테이지만 안 했다 — 대칭이 깨져 있었다.) 지금은 s02 가 CloudFront 형상을 스스로 심듯,
 *    이 스테이지도 워크플로가 없으면 브리핑에 적은 그 결함 스텝을 스스로 심는다 — 스테이지가
 *    "이미 있는 것을 고쳐라" 가 아니라 **자족적으로 재현**하게 만드는 것이 근본 수정이다.
 *    (`@core` 의 `submit()` 이 `stage.verify` 예외를 빨간 신호로 바꾸는 try/catch 는 이미 있다
 *    — 그것은 크래시로 궤적이 안 날아가게 막는 **증상 완화**일 뿐, 이 파일이 ENOENT 자체를
 *    없애는 **원인 제거**와는 다른 층이다.)
 */
import fs from 'node:fs/promises';
import path from 'node:path';

import type { IStageDefinition, IStageIO, ISignal } from '@core/fe-agent-harness';

import { loadCloudFrontConfig } from '../aws/loadConfig.ts';
import { createDistribution, readDeployIntent } from '../aws/simulate.ts';
import { cloudfrontConfigPath } from '../paths.ts';
import type { IReactVitePaths } from '../paths.ts';

/** 두 번째 배포를 흉내 내려고 dist 사본을 만들고 해시 이름을 바꾼다(= 새 빌드 산출). */
const makeNextRelease = async (distDir: string, target: string) => {
  await fs.rm(target, { recursive: true, force: true });
  await fs.cp(distDir, target, { recursive: true });
  const assets = path.join(target, 'assets');
  const entries = await fs.readdir(assets).catch(() => [] as string[]);
  const renames = new Map<string, string>();

  for (const name of entries) {
    if (!/\.(js|css)$/.test(name)) {
      continue;
    }
    const next = name.replace(/-([A-Za-z0-9_-]{8})\./, '-NEXTHASH$1.');
    renames.set(name, next);
    await fs.rename(path.join(assets, name), path.join(assets, next));
  }

  const indexPath = path.join(target, 'index.html');
  let html = await fs.readFile(indexPath, 'utf8');
  for (const [from, to] of renames) {
    html = html.split(from).join(to);
  }
  await fs.writeFile(indexPath, html, 'utf8');
};

/**
 * 브리핑이 말하는 "현재 배포 스텝" 그대로 — `--delete` 만 있고 `--cache-control` 이 없는
 * sync 한 줄 + `/*` 전면 무효화. `readDeployIntent()` 가 파싱하는 문법(`aws s3 sync … s3://…`
 * 한 줄 · `PATH_TO_INVALIDATE:` 한 줄)에 맞춰 쓴다.
 */
const seedDeployWorkflow = (paths: IReactVitePaths): string => `name: deploy

on:
  push:
    tags:
      - 'prod-*'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: sync build output
        run: aws s3 sync ./${paths.distDir} s3://tiny-galaxy-bucket --delete
      - name: invalidate CDN
        run: aws cloudfront create-invalidation --distribution-id "$DISTRIBUTION_ID" --paths "$PATH_TO_INVALIDATE"
        env:
          PATH_TO_INVALIDATE: /*
`;

export const createStage03 = (paths: IReactVitePaths): IStageDefinition => {
  const configPath = cloudfrontConfigPath(paths, 'prod');

  return {
    id: 's03-cache-invalidation',
    title: '배포 캐싱과 무효화',
    intent: '해시 자산과 index.html 의 캐시 수명을 갈라, 낡은 index 가 사라진 청크를 가리키는 창을 없앤다.',
    maxSteps: 8,
    contractLanes: { quality: false, typeSafety: false, a11y: false, tailwind: false, delivery: true },

    setup: async (io: IStageIO) => {
      if (!(await io.exists(configPath))) {
        await io.write(
          configPath,
          `${JSON.stringify(
            {
              originIsWebsiteEndpoint: false,
              defaultRootObject: 'index.html',
              customErrorResponses: [{ from: 403, to: '/index.html', status: 200 }],
              viewerRequestFunction: 'none',
            },
            null,
            2,
          )}\n`,
        );
      }

      /* ⚠️ 이 스테이지가 고치라고 하는 바로 그 파일이다. 저장소에 배포 워크플로가 이미 있으면
         그것을 신뢰하고 건드리지 않는다 — 없을 때만(이 픽스처처럼) 브리핑에 적은 결함 스텝을
         심는다. 안 그러면 `readDeployIntent()` 가 없는 파일을 읽다가 ENOENT 로 죽는다
         (2026-09-04 실측 — 이 파일 머리말 참고). */
      if (!(await io.exists(paths.deployWorkflow))) {
        await io.write(paths.deployWorkflow, seedDeployWorkflow(paths));
        io.log(`⚠️ ${paths.deployWorkflow} 가 없어 브리핑의 결함 배포 스텝을 스스로 심었다.`);
      }
    },

    briefing: async () => `
운영 배포 직후 5~10분간 흰 화면 신고가 들어온다. 새로고침하면 낫는 사람도 있고 안 낫는 사람도 있다.
콘솔에는 청크 하나가 403 이다.

현재 배포 스텝(\`${paths.deployWorkflow}\`):
    aws s3 sync ./${paths.distDir} s3://<bucket> --delete
    PATH_TO_INVALIDATE: /*

채점은 시뮬레이터에서 **연속 두 번 배포**한 뒤, 첫 배포 때 엣지에 남은 응답을 그대로 두고 요청한다.
고칠 자리는 워크플로의 sync 스텝과 \`${configPath}\` 두 곳이다.

⚠️ 채점기가 읽는 문법은 이렇다(못 읽으면 **빨간 축으로 알려 준다** — 조용히 넘어가지 않는다):
    aws s3 sync <원본> s3://<버킷>[/<접두사>] [--delete] [--cache-control <값>] [--exclude <값>]
    aws cloudfront create-invalidation … --paths <경로>     (또는 \`PATH_TO_INVALIDATE:\` 환경변수)
   따옴표는 큰 것·작은 것·없는 것 다 받는다.

⚠️ "무효화를 \`/*\` 로 하면 되잖아" 로 끝내지 마라 — 그것은 해시 자산 캐시까지 통째로 버리는 것이라
   요금과 오리진 부하가 배포마다 튄다. 채점은 무효화 범위도 본다.
`,


    parses: [configPath, paths.deployWorkflow],
    verify: async (io: IStageIO): Promise<ISignal[]> => {
      const intent = await readDeployIntent(path.join(io.root, paths.deployWorkflow));
      const config = await loadCloudFrontConfig(path.join(io.root, configPath));
      const distribution = createDistribution(config);
      const signals: ISignal[] = [];

      /* ⚠️ 못 읽은 줄을 **조용히 버리지 않는다.** s02 에서 배운 것 — 하네스의 사적인
         문법에 안 맞는다고 침묵하면, 현실을 아는 에이전트가 「고쳤는데 왜 실패지」를 겪는다. */
      for (const line of intent.unreadable ?? []) {
        signals.push({
          name: '배포 스텝을 읽을 수 있다',
          ok: false,
          measured: line,
          detail: '이 줄의 문법을 못 알아봤다 — `aws s3 sync <원본> s3://<버킷>[/<접두사>] [--delete] [--cache-control <값>] [--exclude <값>]` 또는 `aws cloudfront create-invalidation … --paths <경로>` 형태로 적어라.',
        });
      }
      if (config.rejected) {
        signals.push({ name: 'CloudFront 형상을 읽을 수 있다', ok: false, measured: config.rejected });
      }

      /* 1차 배포 — 워크플로에 적힌 그대로 */
      for (const sync of intent.syncs) {
        await distribution
          .sync(path.join(io.root, sync.source), sync.options)
          .catch(() => io.log(`sync 소스를 못 읽었다: ${sync.source}`));
      }

      /* 사용자가 방문해 엣지에 응답이 남는다 */
      const firstIndex = distribution.request('/index.html');
      const firstChunk = [...firstIndex.body.matchAll(/src="\/?(assets\/[^"]+\.js)"/g)].map((match) => match[1])[0];
      if (firstChunk) {
        distribution.request(`/${firstChunk}`);
      }

      const anyAsset = [...distribution.bucket.values()].find((object) => object.key.startsWith('assets/'));
      signals.push({
        name: '해시 자산은 장기 캐시다',
        ok: Boolean(anyAsset && /max-age=\d{6,}/.test(anyAsset.cacheControl) && /immutable/.test(anyAsset.cacheControl)),
        measured: anyAsset?.cacheControl || '(헤더 없음)',
        detail: '파일 이름에 해시가 있으므로 내용이 바뀌면 이름이 바뀐다 — 오래 캐시해도 안전하다.',
      });

      signals.push({
        name: 'index.html 은 캐시하지 않는다',
        ok: /no-cache|no-store|max-age=0/.test(distribution.bucket.get('index.html')?.cacheControl ?? ''),
        measured: distribution.bucket.get('index.html')?.cacheControl || '(헤더 없음)',
      });

      /* 2차 배포 — 새 해시. 무효화는 워크플로에 적힌 범위만 수행한다. */
      const nextDist = path.join(io.root, '.harness', 'next-dist');
      await makeNextRelease(path.join(io.root, paths.distDir), nextDist);
      for (const sync of intent.syncs) {
        await distribution.sync(nextDist, sync.options).catch(() => undefined);
      }
      distribution.invalidate(intent.invalidationPaths.map((entry) => (entry.startsWith('/') ? entry : `/${entry}`)));

      const secondIndex = distribution.request('/index.html');
      const secondChunk = [...secondIndex.body.matchAll(/src="\/?(assets\/[^"]+\.js)"/g)].map((match) => match[1])[0];
      const chunkResponse = secondChunk ? distribution.request(`/${secondChunk}`) : { status: 0, body: '' };

      signals.push({
        name: '2차 배포 후 index 가 최신이다',
        ok: secondIndex.body.includes('NEXTHASH'),
        measured: secondIndex.fromEdgeCache ? '엣지 캐시에서 나왔다' : '오리진에서 새로 왔다',
        detail: '낡은 index 가 남으면 그 index 가 가리키는 청크는 `--delete` 로 이미 지워졌다.',
      });

      signals.push({
        name: '그 index 가 가리키는 청크가 200 이다',
        ok: chunkResponse.status === 200,
        measured: `${chunkResponse.status} (${secondChunk ?? '청크 없음'})`,
      });

      signals.push({
        name: '무효화 범위가 index 로 좁다',
        ok: intent.invalidationPaths.length > 0 && !intent.invalidationPaths.includes('/*'),
        measured: intent.invalidationPaths.join(' ') || '(없음)',
        detail: '해시 자산은 이름이 바뀌므로 무효화할 이유가 없다.',
      });

      return signals;
    },
  };
};
