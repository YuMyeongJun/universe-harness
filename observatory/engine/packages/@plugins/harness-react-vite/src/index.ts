/**
 * @plugins/harness-react-vite — React + Vite + AWS(S3/CloudFront) 특화 플러그인.
 *
 * 다른 스택으로 갈 때 갈아 끼우는 것은 **이 패키지 하나**다. 코어와 계약 패키지는 그대로 쓴다.
 */
export { ReactViteHarness } from './ReactViteHarness.ts';
export type { IReactViteHarnessOptions, ILintTarget } from './ReactViteHarness.ts';
export { DEFAULT_REACT_VITE_PATHS, cloudfrontConfigPath, inApp } from './paths.ts';
export { loadProjectConfig, stripJsonc, CONFIG_FILE_NAMES } from './config.ts';
export { parseArgv, VALUE_FLAGS } from './argv.ts';
export { initProjectConfig } from './init.ts';
export { scanCodebase, formatScan } from './scan.ts';
export { verifyWorkingTree } from './verify.ts';
export type { IVerifyOptions, IVerifyResult } from './verify.ts';
export type { IScanResult } from './scan.ts';
export type { IInitResult } from './init.ts';
export type { IHarnessProjectFile, IResolvedProjectConfig } from './config.ts';
export type { IReactVitePaths } from './paths.ts';
export { DELIVERY_RULES } from './rules/delivery.ts';
export { createReactViteStages, createStage01, createStage02, createStage03, createStage04 } from './stages/index.ts';
export type { IStageDeps } from './stages/index.ts';
export { createDistribution, readDeployIntent } from './aws/simulate.ts';
export type { ICloudFrontConfig, IDistribution, ISyncOptions, IDeployIntent } from './aws/simulate.ts';
export { loadCloudFrontConfig } from './aws/loadConfig.ts';
