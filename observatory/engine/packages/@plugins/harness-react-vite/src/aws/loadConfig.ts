/**
 * 배포 형상을 **파일 하나에서** 읽는다 — `infra/cloudfront/<env>.json`.
 *
 * 이 파일은 지금 저장소에 없다. 스테이지가 만들고, 에이전트가 고치고, 시뮬레이터가 읽는다.
 * 즉 "CloudFront 를 어떻게 세웠는가" 가 **코드로 남는 자리**를 훈련장 안에 먼저 만들어 두는 것이다.
 * 실제로 이 형상을 콘솔에서만 바꾸면 다음 사람이 이유를 영원히 모른다.
 */
import fs from 'node:fs/promises';

import type { ICloudFrontConfig } from './simulate.ts';

/** viewer-request 함수는 이름으로만 고른다 — 판정이 결정론이어야 하므로 임의 코드를 받지 않는다. */
const VIEWER_FUNCTIONS: Record<string, (uri: string) => string> = {
  none: (uri) => uri,
  /** `/demo/` 처럼 `/` 로 끝나는 요청에 `index.html` 을 붙인다(S3 REST 엔드포인트에는 디렉터리 인덱스가 없다). */
  appendIndexHtmlOnTrailingSlash: (uri) => (uri.endsWith('/') ? `${uri}index.html` : uri),
};

/**
 * 오류 응답 규칙을 **AWS 의 진짜 이름으로도** 받는다.
 *
 * ⚠️ 실측: 에이전트가 `{ errorCode, responseCode, responsePagePath }` 로 썼다 —
 * **그게 AWS 의 실제 필드명이고, 현실을 아는 사람의 올바른 추측이다.**
 * 우리 스키마는 `{ from, to, status }` 였고, 맞지 않는 항목을 **조용히 무시**했다.
 * 오류도 반려도 없이 설정이 그냥 안 먹었고, 딥링크는 403 그대로였다.
 * 게다가 스테이지가 심는 초기값은 `[]` 라 **모양을 보여 주는 예시조차 없었다.**
 *
 * ⇒ 두 이름을 다 받고, **어느 쪽도 아닌 항목은 조용히 버리지 않고 사유로 낸다.**
 */
const normalizeErrorResponses = (
  raw: unknown,
): { ok: { from: number; to: string; status: number }[]; bad: string[] } => {
  const ok: { from: number; to: string; status: number }[] = [];
  const bad: string[] = [];
  for (const entry of Array.isArray(raw) ? raw : []) {
    const e = entry as Record<string, unknown>;
    const from = typeof e.from === 'number' ? e.from : typeof e.errorCode === 'number' ? e.errorCode : null;
    const to = typeof e.to === 'string' ? e.to : typeof e.responsePagePath === 'string' ? e.responsePagePath : null;
    const status = typeof e.status === 'number' ? e.status : typeof e.responseCode === 'number' ? e.responseCode : null;
    if (from === null || to === null || status === null) {
      bad.push(JSON.stringify(entry).slice(0, 120));
      continue;
    }
    ok.push({ from, to, status });
  }
  return { ok, bad };
};

export interface ICloudFrontConfigFile {
  originIsWebsiteEndpoint?: boolean;
  defaultRootObject?: string;
  customErrorResponses?: { from: number; to: string; status: number }[];
  behaviors?: { pathPattern: string; customErrorResponses: { from: number; to: string; status: number }[] }[];
  viewerRequestFunction?: keyof typeof VIEWER_FUNCTIONS;
}

/** 이 형상 파일이 왜 못 읽히는지 — 터뜨리지 않고 나른다. */
export const VIEWER_FUNCTION_NAMES = Object.keys(VIEWER_FUNCTIONS);

export const loadCloudFrontConfig = async (absolutePath: string): Promise<ICloudFrontConfig & { rejected?: string }> => {
  /* ⚠️ **JSON 자체가 깨진 경우도 터뜨리지 않는다.** `parses` 강제 시험을 만들자마자
     이 자리가 세 번째 사례로 잡혔다 — 에이전트가 JSON 을 잘못 쓰면 채점이 통째로 터지고
     궤적에는 「채점이 터졌다」만 남는다. 파싱 오류는 **고칠 수 있는 정보**이므로 돌려준다. */
  const text = await fs.readFile(absolutePath, 'utf8').catch(() => '');
  let parsed: ICloudFrontConfigFile;
  try {
    parsed = JSON.parse(text) as ICloudFrontConfigFile;
  } catch (error) {
    return {
      originIsWebsiteEndpoint: false,
      customErrorResponses: [],
      viewerRequestRewrite: VIEWER_FUNCTIONS.none,
      rejected: `이 파일이 올바른 JSON 이 아니다 — ${String(error).split('\n')[0].slice(0, 120)}`,
    };
  }
  const errors = normalizeErrorResponses(parsed.customErrorResponses);
  const viewer = parsed.viewerRequestFunction ?? 'none';
  /* ⚠️ 예전엔 여기서 던졌다. 실제 에피소드에서 에이전트가 **진짜 CloudFront Function 코드**를
     써 넣었고(현실에서는 그게 맞다), 채점이 통째로 터져 다른 축을 하나도 못 봤다.
     궤적에는 「채점이 터졌다」만 남아 **에이전트 탓처럼 보였다.**
     이제 사유를 신호로 나른다 — 스테이지가 그것을 빨간 축 하나로 만들고 나머지는 계속 잰다. */
  if (!(viewer in VIEWER_FUNCTIONS)) {
    return {
      originIsWebsiteEndpoint: parsed.originIsWebsiteEndpoint ?? false,
      defaultRootObject: parsed.defaultRootObject,
      customErrorResponses: errors.ok,
      behaviors: parsed.behaviors,
      viewerRequestRewrite: VIEWER_FUNCTIONS.none,
      rejected: `viewerRequestFunction 은 **이름만** 받는다(임의 코드가 아니다). 가능: ${VIEWER_FUNCTION_NAMES.join(' · ')}`,
    };
  }
  return {
    originIsWebsiteEndpoint: parsed.originIsWebsiteEndpoint ?? false,
    defaultRootObject: parsed.defaultRootObject,
    customErrorResponses: errors.ok,
    behaviors: parsed.behaviors,
    viewerRequestRewrite: VIEWER_FUNCTIONS[viewer],
    /* 조용히 버리지 않는다 — 못 읽은 항목이 있으면 그것도 신호가 된다. */
    rejected: errors.bad.length > 0
      ? `customErrorResponses 에서 못 읽은 항목 ${errors.bad.length}개: ${errors.bad.join(' , ')}  (받는 모양: {from,to,status} 또는 AWS 이름 {errorCode,responsePagePath,responseCode})`
      : undefined,
  };
};
