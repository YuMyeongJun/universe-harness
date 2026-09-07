/**
 * 원격 계층 가드 — GitHub API 가 만드는 **새 거짓 통과 자리**를 막는다.
 *
 * `src/guards/measure.ts` 의 사고방식을 API 층에 옮긴 것이다. 원칙은 하나다:
 *
 *   ⭐ **「호출이 성공했다」와 「잴 것이 있었다」를 다른 칸에 둔다.**
 *
 * 200 을 주면서 빈 배열을 주는 경우가 제일 위험하다 — 라벨이 사라졌거나 쿼리가 틀렸을 때
 * 그렇게 나오고, 그건 「위반 없음」이 아니라 **미도달** 신호다.
 *
 * 그리고 쓰기 쪽에서는 **부분 성공 + 0 종료**가 제일 위험하다. 실측 사고 둘:
 * 492건 중 35건만 종결되고 "완료" 보고 / 524건이 6건만 돌고 "완료" 보고 —
 * 둘 다 **「스폰 성공」을 「완료」로 보고**한 것이었다.
 */

/** 못 쟀다 — 통과도 실패도 아니다. 호출 쪽이 「쓰기 전인가 읽는 중인가」로 판정을 정한다. */
export class UnmeasuredError extends Error {
  readonly kind = 'unmeasured' as const;
  constructor(message: string) {
    super(message);
    this.name = 'UnmeasuredError';
  }
}

/**
 * 조회 결과 개수를 단언한다.
 *
 * ⛔ **0건을 「없음」으로 세지 마라.** 라벨이 사라졌거나 쿼리가 틀렸어도 200 + 빈 배열이다.
 *    「없는 것이 정상」인 조회라면 `expectEmpty: true` 로 **의도를 적어라.**
 */
export const assertQueryMeasured = (
  label: string,
  count: number,
  opts: { min?: number; expectEmpty?: boolean } = {},
): number => {
  if (opts.expectEmpty === true) return count;
  const min = opts.min ?? 1;
  if (!Number.isFinite(count) || count < min) {
    throw new Error(
      `[github] ${label}: 결과가 ${count}건이다(최소 ${min}). ` +
        '200 을 받았어도 빈 결과는 "없음"이 아니라 **라벨 소실·쿼리 오류·권한 부족** 신호다. ' +
        '없는 것이 정상이면 expectEmpty 로 의도를 적어라.',
    );
  }
  return count;
};

/**
 * 쿼리가 기대는 라벨이 **실제로 존재하는지** 먼저 단언한다.
 *
 * 라벨이 사라지면 그 라벨로 거는 쿼리는 조용히 **빈 결과**를 준다.
 * 0건을 "해당 TC 가 없다"로 읽는 순간 사라진 라벨이 영원히 안 보인다.
 */
export const assertLabelsExist = (required: string[], present: string[]): void => {
  const have = new Set(present);
  const missing = required.filter((name) => !have.has(name));
  if (missing.length > 0) {
    throw new Error(
      `[github] 라벨이 없다: ${missing.join(', ')}\n` +
        '  이 라벨로 거는 쿼리는 조용히 빈 결과를 준다 — 0건이 "없음"으로 읽힌다.',
    );
  }
};

export interface IPageInfo {
  hasNextPage: boolean;
  endCursor?: string | null;
}

/**
 * 페이지네이션을 **끝까지** 소진했는지 단언한다.
 *
 * 중간에 끊긴 결과를 전체로 읽으면, 뒤쪽 페이지의 위반이 통째로 안 보인다.
 * 그리고 그 결과는 **에러 없이** 나온다 — 그래서 위험하다.
 */
export const assertPaginationExhausted = (label: string, pageInfo: IPageInfo): void => {
  if (pageInfo.hasNextPage) {
    throw new Error(
      `[github] ${label}: 페이지가 남았는데 멈췄다(hasNextPage=true). ` +
        '부분 결과를 전체로 읽으면 뒤쪽 위반이 통째로 안 보인다.',
    );
  }
};

/**
 * **쓰고 나서 다시 읽어** 확인한다. 쓰기 성공은 쓰기 확인이 아니다.
 *
 * 응답이 200 이어도 일부만 반영되는 경우가 있다(부분 성공 + 0 종료).
 * @param written  쓰려고 한 식별자들
 * @param readBack 다시 읽어서 실제로 확인된 식별자들
 */
export const assertWriteVerified = (
  label: string,
  written: readonly string[],
  readBack: readonly string[],
): void => {
  const confirmed = new Set(readBack);
  const missing = written.filter((id) => !confirmed.has(id));
  if (missing.length > 0) {
    throw new Error(
      `[github] ${label}: ${written.length}건 중 ${missing.length}건이 재조회에서 확인되지 않았다.\n` +
        `  확인 안 된 것: ${missing.slice(0, 10).join(', ')}${missing.length > 10 ? ' …' : ''}\n` +
        '  쓰기 성공은 쓰기 확인이 아니다 — 부분 성공 + 0 종료가 제일 위험하다.',
    );
  }
};

export interface IRateLimitLike {
  status?: number;
  headers?: Record<string, string | undefined>;
}

/**
 * rate limit 응답을 성공으로 세지 않는다.
 *
 * 403 + `x-ratelimit-remaining: 0` 은 「권한 없음」이 아니라 「지금은 못 잰다」다.
 * 이걸 빈 결과로 흘리면 조용히 통과한다.
 */
export const assertNotRateLimited = (label: string, response: IRateLimitLike): void => {
  const remaining = response.headers?.['x-ratelimit-remaining'];
  const retryAfter = response.headers?.['retry-after'];
  const limited =
    (response.status === 403 || response.status === 429) && (remaining === '0' || retryAfter !== undefined);
  if (limited) {
    throw new UnmeasuredError(
      `[github] ${label}: rate limit 에 걸렸다(status=${response.status}). ` +
        '지금은 못 잰다 — 성공으로도 실패로도 세지 않는다.',
    );
  }
};

/**
 * 필요한 토큰 스코프가 있는지 본다.
 *
 * ⛔ **없다고 조용히 건너뛰지 마라.** 건너뛰면 "동기화됐다"로 읽힌다.
 *    쓰기 직전이면 실패, 읽어서 재는 중이면 ⚪ — 판정은 **호출 쪽**이 정한다.
 */
export const assertScopeOrUnmeasured = (required: string, scopes: readonly string[]): void => {
  if (!scopes.includes(required)) {
    throw new UnmeasuredError(
      `[github] 토큰에 '${required}' 스코프가 없다(있는 것: ${scopes.join(', ') || '없음'}). ` +
        `\`gh auth refresh -s ${required}\` 가 필요하다. 조용히 건너뛰지 않는다.`,
    );
  }
};

/**
 * 원격 좌표를 **`origin` 에서 파생**한다. 저장소 주소를 코드에 적지 않는다.
 *
 * 개인 깃이든 회사 깃이든 자동으로 따라가고, 옮길 때 고칠 것이 없다.
 *
 * ⚠️ **모르는 호스트에는 지어내지 않는다.** GitHub Enterprise 를 일부러 `null` 로 둔다 —
 *    그 호스트의 규칙을 확인한 적이 없기 때문이다. 확인 안 한 것을 맞다고 가정하는 것이 지어내기다.
 *    SSH 짧은 형식은 `null` 이 아니다 — 「모르는 호스트」가 아니라 「아는 호스트의 다른 표기」다.
 */
export interface IRepoCoordinate {
  owner: string;
  repo: string;
  /** 위키 저장소 주소 — REST API 가 없어서 git 으로만 쓴다 */
  wikiRemote: string;
}

const GITHUB_HOST = /(^|\.)github\.com$/;

export const repoCoordinateOf = (originUrl: string): IRepoCoordinate | null => {
  const raw = originUrl.trim();
  if (raw === '') return null;

  // git@github.com:owner/repo.git → 먼저 편다
  const ssh = /^[A-Za-z0-9._-]+@([^:]+):(.+)$/.exec(raw);
  const normalized = ssh ? `https://${ssh[1]}/${ssh[2]}` : raw;

  let url: URL;
  try {
    url = new URL(normalized);
  } catch {
    return null;
  }
  if (!GITHUB_HOST.test(url.hostname)) return null;

  const segments = url.pathname.replace(/^\/+/, '').replace(/\.git$/, '').split('/').filter(Boolean);
  if (segments.length < 2) return null;
  const [owner, repo] = segments as [string, string];

  return { owner, repo, wikiRemote: `https://${url.hostname}/${owner}/${repo}.wiki.git` };
};

/** 쓰기 직전에 부른다 — 좌표를 못 세우면 **실패**다. 어디에 쓸지 모르는데 쓰지 않는다. */
export const requireRepoCoordinate = (originUrl: string): IRepoCoordinate => {
  const coordinate = repoCoordinateOf(originUrl);
  if (coordinate === null) {
    throw new Error(
      `[github] origin 에서 저장소 좌표를 못 세웠다: "${originUrl}"\n` +
        '  지어내지 않는다. github.com 이 아니거나(Enterprise 포함) origin 이 없다.',
    );
  }
  return coordinate;
};
