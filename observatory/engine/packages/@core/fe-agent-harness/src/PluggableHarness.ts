/**
 * 상속하지 않는 확장 경로 — 플러그인 객체만 넘기면 도는 구체 클래스.
 *
 * 새 프레임워크를 얹을 때 **먼저 여기로 시작하라.** 스테이지 두어 개와 게이트 하나면
 * 상속 계층이 필요 없다. 프로젝트가 커져 훅을 여럿 덮어써야 할 때 `EnvHarness` 상속으로 옮긴다
 * (`@plugins/harness-react-vite` 가 그 예다).
 */
import { EnvHarness } from './EnvHarness.ts';
import type { IHarnessPlugin } from './EnvHarness.ts';
import type { IHarnessConfig, ISignal, IStageDefinition, IStageIO, IStaticRule } from './types.ts';

export interface IPluggableConfig extends IHarnessConfig {
  plugins: IHarnessPlugin[];
}

export class PluggableHarness extends EnvHarness {
  private readonly plugins: IHarnessPlugin[];

  constructor(config: IPluggableConfig) {
    super(config);
    this.plugins = config.plugins;
  }

  protected async executeBuildAndTest(io: IStageIO): Promise<ISignal[]> {
    const runner = this.plugins.find((plugin) => plugin.buildAndTest);
    if (!runner?.buildAndTest) {
      throw new Error('게이트를 구현한 플러그인이 없다 — `buildAndTest` 를 채우거나 EnvHarness 를 상속하라.');
    }
    return runner.buildAndTest(io);
  }

  protected async simulateDelivery(io: IStageIO, stage: IStageDefinition): Promise<ISignal[]> {
    const results = await Promise.all(
      this.plugins.filter((plugin) => plugin.simulateDelivery).map((plugin) => plugin.simulateDelivery!(io, stage)),
    );
    return results.flat();
  }

  protected provideStages(): IStageDefinition[] {
    return this.plugins.flatMap((plugin) => plugin.stages ?? []);
  }

  protected provideStaticRules(): IStaticRule[] {
    return this.plugins.flatMap((plugin) => plugin.staticRules ?? []);
  }
}
