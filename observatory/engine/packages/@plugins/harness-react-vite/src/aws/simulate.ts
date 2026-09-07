/**
 * S3 + CloudFront 시뮬레이터 — 배포 스테이지의 **관측 장치**.
 *
 * 왜 필요한가: SPA 배포 사고는 빌드가 초록불인 채로 난다. `yarn build` 는 통과하고,
 * 깨지는 것은 **원본이 객체 스토리지라는 사실**에서만 나온다:
 *   - S3 에 디렉터리는 없다 → `/brandmsg/manual-send` 라는 **키가 없으므로** 403/404 다.
 *   - CloudFront 「기본 루트 객체」는 **배포 루트에만** 적용된다. 하위 경로는 못 고친다.
 *   - `aws s3 sync --delete` 는 해시 붙은 낡은 청크를 **지운다**. 그런데 엣지가 낡은
 *     index.html 을 아직 물고 있으면 그 index 가 가리키는 청크는 404 → 흰 화면.
 *
 * 이 시뮬레이터는 위 세 가지를 그대로 재현한다. 네트워크는 쓰지 않는다.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

export interface IBucketObject {
  key: string;
  body: Buffer;
  cacheControl: string;
  contentType: string;
}

export interface ISyncOptions {
  /** `--delete` — 소스에 없는 목적지 객체를 지운다 */
  deleteRemoved: boolean;
  /** `--cache-control "..."`. 미지정이면 빈 문자열(= 헤더 없음). */
  cacheControl: string;
  /** `--exclude "demo/…"` 류 */
  exclude: string[];
  /** S3 상의 접두사(`s3://bucket/demo` 처럼 하위에 올릴 때) */
  prefix?: string;
}

export interface IBehavior {
  /** `/assets/…` 처럼 CloudFront 캐시 동작의 경로 패턴. 첫 매치가 이긴다(`*` 를 마지막에 둔다). */
  pathPattern: string;
  customErrorResponses: { from: number; to: string; status: number }[];
}

export interface ICloudFrontConfig {
  /** 배포 **루트**에만 적용된다. 하위 경로 폴백이 아니다. */
  defaultRootObject?: string;
  /** [{ from: 403, to: '/index.html', status: 200 }] — behaviors 가 없을 때만 쓰인다 */
  customErrorResponses: { from: number; to: string; status: number }[];
  /** 경로별 동작. 자산과 문서에 다른 규칙을 주려면 이것을 쓴다. */
  behaviors?: IBehavior[];
  /** viewer-request 함수: URI 를 다시 쓴다. 실제 CF Function 과 같은 자리. */
  viewerRequestRewrite?: (uri: string) => string;
  /** 오리진이 S3 **정적 웹사이트 엔드포인트**면 true(디렉터리 인덱스가 동작한다) */
  originIsWebsiteEndpoint: boolean;
}

export interface IEdgeResponse {
  status: number;
  body: string;
  cacheControl: string;
  fromEdgeCache: boolean;
}

export interface IDistribution {
  bucket: Map<string, IBucketObject>;
  sync: (fromDir: string, options: ISyncOptions) => Promise<void>;
  request: (url: string) => IEdgeResponse;
  invalidate: (patterns: string[]) => void;
  edgeSize: () => number;
}

const contentTypeOf = (key: string) => {
  const ext = path.extname(key);
  const map: Record<string, string> = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.svg': 'image/svg+xml',
    '.json': 'application/json',
  };
  return map[ext] ?? 'application/octet-stream';
};

const matchesGlob = (key: string, pattern: string) => {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`).test(key);
};

const walk = async (dir: string, base = dir): Promise<string[]> => {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return walk(full, base);
      }
      return [path.relative(base, full).split(path.sep).join('/')];
    }),
  );
  return files.flat();
};

export const createDistribution = (config: ICloudFrontConfig): IDistribution => {
  const bucket = new Map<string, IBucketObject>();
  const edge = new Map<string, { status: number; body: string; cacheControl: string }>();

  const sync = async (fromDir: string, options: ISyncOptions) => {
    const prefix = options.prefix ? `${options.prefix.replace(/\/$/, '')}/` : '';
    const files = await walk(fromDir);
    const seen = new Set<string>();

    for (const rel of files) {
      const key = `${prefix}${rel}`;
      if (options.exclude.some((pattern) => matchesGlob(rel, pattern))) {
        continue;
      }
      seen.add(key);
      bucket.set(key, {
        key,
        body: await fs.readFile(path.join(fromDir, rel)),
        cacheControl: options.cacheControl,
        contentType: contentTypeOf(key),
      });
    }

    if (options.deleteRemoved) {
      for (const key of [...bucket.keys()]) {
        const inScope = key.startsWith(prefix);
        const excluded = options.exclude.some((pattern) => matchesGlob(key.slice(prefix.length), pattern));
        if (inScope && !excluded && !seen.has(key)) {
          bucket.delete(key);
        }
      }
    }
    /* ⚠️ 무효화는 여기서 자동으로 일어나지 않는다. 엣지 캐시는 그대로 남는다 — 실제와 같다. */
  };

  const fromOrigin = (uri: string): { status: number; object?: IBucketObject } => {
    const bare = uri.replace(/^\//, '');
    if (bare === '' && config.defaultRootObject) {
      const root = bucket.get(config.defaultRootObject);
      return root ? { status: 200, object: root } : { status: 404 };
    }
    const direct = bucket.get(bare);
    if (direct) {
      return { status: 200, object: direct };
    }
    if (config.originIsWebsiteEndpoint) {
      /* 정적 웹사이트 엔드포인트만 디렉터리 인덱스를 흉내 낸다 */
      const indexKey = `${bare.replace(/\/$/, '')}/index.html`;
      const index = bucket.get(indexKey);
      if (index) {
        return { status: 200, object: index };
      }
      return { status: 404 };
    }
    /* REST 엔드포인트 + OAC: 없는 키는 403(ListBucket 권한이 없으므로 404 가 아니다) */
    return { status: 403 };
  };

  const request = (url: string): IEdgeResponse => {
    const uri = config.viewerRequestRewrite ? config.viewerRequestRewrite(url) : url;
    const cached = edge.get(uri);
    if (cached && !/no-cache|no-store/.test(cached.cacheControl)) {
      return { ...cached, fromEdgeCache: true };
    }

    let { status, object } = fromOrigin(uri);
    if (!object) {
      const behavior = config.behaviors?.find((candidate) => matchesGlob(uri, candidate.pathPattern));
      const errorRules = behavior ? behavior.customErrorResponses : config.customErrorResponses;
      const mapped = errorRules.find((rule) => rule.from === status);
      if (mapped) {
        const fallback = fromOrigin(mapped.to);
        if (fallback.object) {
          status = mapped.status;
          object = fallback.object;
        }
      }
    }

    const response = {
      status,
      body: object ? object.body.toString('utf8') : '',
      cacheControl: object?.cacheControl ?? '',
    };
    edge.set(uri, response);
    return { ...response, fromEdgeCache: false };
  };

  const invalidate = (patterns: string[]) => {
    for (const uri of [...edge.keys()]) {
      if (patterns.some((pattern) => matchesGlob(uri, pattern))) {
        edge.delete(uri);
      }
    }
  };

  return { bucket, sync, request, invalidate, edgeSize: () => edge.size };
};

/**
 * 워크플로 yml 에서 배포 의도를 **읽어 온다**(정책 파일을 따로 두면 두 벌이 되어 갈라진다).
 * yaml 파서를 새로 들이지 않고 배포 두 줄만 정규식으로 읽는다 — 이 저장소의 배포 스텝은
 * `run: aws s3 sync ./dist s3://<bucket> [flags]` 한 줄과 `PATH_TO_INVALIDATE:` 한 줄이다.
 */
export interface IDeployIntent {
  /** 읽으려 했는데 문법을 못 알아본 줄 — **조용히 버리지 않는다.** */
  unreadable?: string[];
  syncs: { source: string; bucket: string; prefix: string; options: ISyncOptions }[];
  invalidationPaths: string[];
}

/** 따옴표를 가리지 않고 값을 꺼낸다 — `"x"` · `'x'` · 맨 토큰 전부. */
const optionValue = (flags: string, name: string): string | null => {
  const quoted = new RegExp(`--${name}\\s+(?:"([^"]*)"|'([^']*)')`).exec(flags);
  if (quoted) { return quoted[1] ?? quoted[2] ?? ''; }
  const bare = new RegExp(`--${name}\\s+([^\\s"']+)`).exec(flags);
  return bare ? bare[1] : null;
};

const optionValues = (flags: string, name: string): string[] => {
  const all: string[] = [];
  const re = new RegExp(`--${name}\\s+(?:"([^"]*)"|'([^']*)'|([^\\s"']+))`, 'g');
  let m = re.exec(flags);
  while (m !== null) { all.push(m[1] ?? m[2] ?? m[3] ?? ''); m = re.exec(flags); }
  return all;
};

/**
 * 배포 워크플로에서 **의도**를 읽는다.
 *
 * ⚠️⚠️ 이 훑개는 우리만의 작은 문법이다. 실제 에피소드(s02)에서 배운 것 —
 * **하네스가 사적인 스키마를 쓰면서 그것을 안 알려 주면, 현실을 아는 에이전트가 벌받는다.**
 * 그래서 두 가지를 지킨다:
 *   1) **현실의 표기를 최대한 받는다** — 작은따옴표 · 맨 토큰 · 진짜 `create-invalidation --paths`
 *   2) **못 읽은 줄을 조용히 버리지 않는다** — `unreadable` 로 나른다
 *
 * 예전엔 큰따옴표만 받고 `PATH_TO_INVALIDATE:` 라는 **AWS 에 없는 이름**만 봤다.
 * 에이전트가 `--paths "/index.html"` 처럼 **진짜 방식**으로 쓰면 통째로 무시됐다.
 */
export const readDeployIntent = async (workflowPath: string): Promise<IDeployIntent> => {
  /* ⚠️ **파일이 없어도 터지지 않는다.** 에이전트가 워크플로를 지우거나 옮기면
     예전엔 채점이 통째로 죽었다 — 「채점이 터졌다」만 남고 이유를 알 수 없었다.
     없는 것도 **고칠 수 있는 정보**다. */
  const yml = await fs.readFile(workflowPath, 'utf8').catch(() => null);
  if (yml === null) {
    return { syncs: [], invalidationPaths: [], unreadable: [`${workflowPath} 를 읽을 수 없다 — 배포 스텝 파일이 없거나 옮겨졌다`] };
  }
  const syncs: IDeployIntent['syncs'] = [];
  const unreadable: string[] = [];

  for (const line of yml.split('\n')) {
    const matched = /aws\s+s3\s+sync\s+(\S+)\s+s3:\/\/([^\s/]+)(\/\S*)?(.*)$/.exec(line);
    if (!matched) {
      if (/aws\s+s3\s+sync/.test(line)) { unreadable.push(line.trim().slice(0, 120)); }
      continue;
    }
    const [, source, bucket, rawPrefix = '', flags = ''] = matched;
    const cacheControl = optionValue(flags, 'cache-control') ?? '';
    const exclude = optionValues(flags, 'exclude');
    syncs.push({
      source,
      bucket,
      prefix: rawPrefix.replace(/^\//, ''),
      options: { deleteRemoved: /--delete\b/.test(flags), cacheControl, exclude, prefix: rawPrefix.replace(/^\//, '') },
    });
  }

  /* 무효화 경로 — 우리 이름과 **진짜 AWS 명령** 양쪽에서 읽는다. */
  const fromEnv = [...yml.matchAll(/PATH_TO_INVALIDATE:\s*(\S+)/g)].map((m) => m[1]);
  const fromCli = yml.split('\n')
    .filter((line) => /create-invalidation/.test(line))
    .flatMap((line) => optionValues(line, 'paths'))
    .filter((value) => !/^\$/.test(value) && !/^\$\{/.test(value));
  const invalidationPaths = [...new Set([...fromEnv, ...fromCli])];

  for (const line of yml.split('\n')) {
    if (/create-invalidation/.test(line) && optionValues(line, 'paths').length === 0) {
      unreadable.push(line.trim().slice(0, 120));
    }
  }

  return { syncs, invalidationPaths, unreadable };
};
