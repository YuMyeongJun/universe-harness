/**
 * Next 게이트 — **저장소의 기존 명령을 부르기만 한다.** 판정 로직을 여기서 다시 구현하지 않는다.
 *
 * ⛔ 게이트는 러너가 **중앙에서 한 번만** 돈다. 스테이지 setup 이나 에이전트 probe 에서
 *    빌드를 돌리게 두지 마라 — 산출물이 낡으면 조용히 틀린 수가 나온다.
 * ⛔ `lint | tail` 로 재지 마라. 파이프 뒤의 `$?` 는 마지막 명령의 것이라 실패가 「0 error」로 보인다.
 *
 * React+Vite 게이트와 순서는 같지만 **한 칸이 더 있다** — 「빌드 산출 인구조사」.
 * 이유: Next 는 산출 위치를 `next.config` 의 `distDir` 로 바꿀 수 있어서, 설정이 틀리면
 * 스테이지가 **없는 디렉터리를 훑고 「위반 0건」을 낸다.** 그 실패는 초록불로 보인다.
 * 그래서 「몇 개를 실제로 쟀는가」를 게이트 신호로 올려 둔다.
 *
 * ⚠️ `next lint` 는 쓰지 않는다 — Next 15 에서 deprecate 되고 **16.0.0 에서 제거**됐다
 *    (`next lint` 와 `next.config` 의 `eslint` 옵션이 ESLint CLI 로 대체됐다 ·
 *     https://nextjs.org/docs/app/api-reference/config/eslint 의 버전 이력).
 *    그래서 기본 lint 명령은 ESLint CLI 직행이다.
 */
import path from 'node:path';

import {
  parseVitestSummary,
  runCommandGate,
  runLintJsonGate,
  runSequentialGates,
  unmeasuredSignal,
} from '@core/fe-agent-harness';
import type { IGateStep, IHarnessCommands, ISignal, IStageIO } from '@core/fe-agent-harness';

import type { ILintTarget } from './config.ts';
import { readClientBundle } from './output.ts';
import { inApp } from './paths.ts';
import type { INextPaths } from './paths.ts';

export interface INextGateOptions {
  commands: IHarnessCommands;
  lintTargets: ILintTarget[];
  paths: INextPaths;
}

/**
 * 빌드 산출 인구조사.
 *
 * 통과 조건은 「클라이언트 청크를 **한 개 이상** 실제로 셌다」이다. 0개는 「깨끗하다」가 아니라
 * **「아무것도 못 쟀다」**이고, 그 상태에서 뒤따르는 스테이지 채점은 전부 거짓이 된다.
 */
export const runBuildOutputCensus = async (io: IStageIO, paths: INextPaths): Promise<ISignal> => {
  const outputRoot = path.join(io.root, inApp(paths, paths.buildOutputDir));
  const bundle = await readClientBundle(outputRoot, paths.clientChunksDir);

  return {
    name: '빌드 산출 인구조사',
    ok: bundle.files.length > 0,
    measured: `클라이언트 청크 ${bundle.files.length}개 · ${(bundle.totalBytes / 1024).toFixed(0)}KB`,
    detail:
      bundle.files.length > 0
        ? ''
        : [
            `${path.join(inApp(paths, paths.buildOutputDir), paths.clientChunksDir)} 아래에서 .js 를 한 개도 못 찾았다.`,
            '`project.buildOutputDir` 이 next.config 의 `distDir` 과 다르거나, `project.appDir` 이 틀렸다.',
            '이 상태로는 「클라이언트 번들에 무엇이 들었나」를 재는 스테이지가 전부 거짓 초록불을 낸다.',
          ].join('\n'),
  };
};

/**
 * 싼 것 → 비싼 것. **하나라도 죽으면 뒤는 돌리지 않는다** — 죽은 빌드 위에서 잰 수는 전부
 * 거짓이고, 궤적에 섞이면 추출이 그 거짓을 카드로 만든다.
 *
 * ⚠️ `next build` 는 기본적으로 **타입체크를 자기 안에서 돈다**
 *    (`typescript.ignoreBuildErrors` 로 꺼야 안 돈다 ·
 *     https://nextjs.org/docs/app/api-reference/config/typescript).
 *    그래서 별도 `tsc --noEmit` 게이트를 기본으로 넣지 않는다 — 필요하면 설정의
 *    `commands.extraGates` 로 얹어라(그 옵션을 켠 저장소는 반드시 얹어야 한다).
 */
export const createNextBuildAndTest =
  (options: INextGateOptions) =>
  async (io: IStageIO): Promise<ISignal[]> => {
    const { commands, lintTargets, paths } = options;

    /* 선언하지 않은 축은 돌리지 않고 **「못 쟀다」로 낸다**(R146 · react-vite 쪽과 같은 규칙).
       ⛔ 중립 기본값으로 메우면 없는 테스트가 통과하거나, 지어낸 명령의 실패가 별 탓이 된다. */
    const declared = (name: string, command: string | undefined, run: () => Promise<ISignal | ISignal[]>): IGateStep => ({
      name,
      run: command
        ? run
        : async () =>
            unmeasuredSignal(
              name,
              `은하가 \`commands.${name}\` 을 선언하지 않았다 — 명령을 지어내지 않는다. 이 축은 아무도 안 봤다.`,
            ),
    });

    const typecheckCommand = commands.typecheck ?? commands.extraGates?.typecheck;
    const extraGates = Object.entries(commands.extraGates ?? {}).filter(([name]) => name !== 'typecheck');

    return runSequentialGates([
      /* 1) lint — 대상별 JSON 산출을 합산한다(파이프 금지). */
      ...lintTargets.map((entry): IGateStep => {
        const name = entry.workspace ? `lint:${entry.workspace}` : 'lint';
        return declared(name, commands.lintJson, () =>
          runLintJsonGate(io, {
            name,
            command: (commands.lintJson ?? '').replaceAll('<WORKSPACE>', entry.workspace).replaceAll('<TARGET>', entry.target),
          }),
        );
      }),
      /* 2) build — 저장소의 build 스크립트다. `next build` 를 직접 부르지 않는다. */
      declared('build', commands.build, () =>
        runCommandGate(io, { name: 'build', command: commands.build ?? '', timeoutMs: 30 * 60_000 }),
      ),
      /* 3) 산출 인구조사 — 여기가 Next 고유의 칸이다(위 주석 참고). */
      { name: '산출 인구조사', run: () => runBuildOutputCensus(io, paths) },
      /* 4) unit */
      declared('test', commands.test, () =>
        runCommandGate(io, {
          name: 'test',
          command: commands.test ?? '',
          timeoutMs: 15 * 60_000,
          parse: parseVitestSummary,
        }),
      ),
      /* 5) 타입 검사 — `next build` 가 자기 안에서 도는 것이 기본이라(위 ⚠️) 선언은 선택이다.
            그래도 **안 쟀으면 안 쟀다고 말한다** — 「기본이니까 됐다」는 측정이 아니다. */
      declared('typecheck', typecheckCommand, () =>
        runCommandGate(io, { name: 'typecheck', command: typecheckCommand ?? '', timeoutMs: 10 * 60_000 }),
      ),
      /* 5) E2E — 가장 비싸므로 맨 뒤. ⛔ 은하가 선언할 때만 돈다(브라우저를 우리가 깔지 않는다). */
      declared('e2e', commands.e2e, () =>
        runCommandGate(io, { name: 'e2e', command: commands.e2e ?? '', timeoutMs: 30 * 60_000 }),
      ),
      /* 6) 그 밖의 추가 정적 검사 — **적힌 것이 있을 때만 칸을 만든다.**
            ⚠️ `extraGates` 는 축이 아니라 **그릇**이다. 빈 그릇까지 「못 쟀다」로 세면
               없는 눈먼 자리를 가리키게 되고, 그런 경고는 늑대소년이 된다(`lib/blind.mjs` 의 ⚠️). */
      ...extraGates.map(([name, command]): IGateStep => ({
        name,
        run: () => runCommandGate(io, { name, command, timeoutMs: 10 * 60_000 }),
      })),
    ]);
  };
