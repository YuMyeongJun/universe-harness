/**
 * `.next/` 산출을 읽는 부품 — **이 플러그인이 존재하는 이유의 절반이다.**
 *
 * Vite 는 `dist/index.html` 하나가 초기 로드의 진실이라 HTML 한 장을 파싱하면 끝난다.
 * Next 는 그렇지 않다:
 *   - 클라이언트로 가는 코드는 `<out>/static/chunks/**` 에만 있다.
 *   - 서버에서만 도는 코드는 `<out>/server/**` 에 있다.
 *   - 어느 청크가 어느 라우트의 것인지는 매니페스트(`app-build-manifest.json`)가 들고 있다.
 *
 * ⚠️ 매니페스트의 내부 모양은 **Next 의 구현 세부**다(공개 API 문서가 아니다). 그래서 여기서는
 *    「있으면 쓰고, 없거나 모양이 다르면 청크 전체를 훑는다」로 간다. 모양이 바뀌었을 때
 *    조용히 0건을 세고 초록불을 내는 것이 가장 나쁜 실패이므로, 훑은 파일 수를 항상 `measured`
 *    에 실어 사람이 「0개를 검사함」을 볼 수 있게 한다.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

/** 디렉터리를 재귀로 훑어 파일 절대경로를 모은다. 없으면 빈 배열(던지지 않는다). */
export const walkFiles = async (dir: string): Promise<string[]> => {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => null);
  if (entries === null) {
    return [];
  }
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const full = path.join(dir, entry.name);
      return entry.isDirectory() ? walkFiles(full) : [full];
    }),
  );
  return nested.flat();
};

export interface IClientBundle {
  /** 훑은 청크 파일 절대경로. **0개면 잰 것이 없다는 뜻이다 — 초록불로 읽지 마라.** */
  files: string[];
  totalBytes: number;
}

/** 클라이언트로 실제로 나가는 JS 를 전부 모은다(`<out>/static/chunks/**` 의 `.js`). */
export const readClientBundle = async (outputRoot: string, clientChunksDir: string): Promise<IClientBundle> => {
  const chunkRoot = path.join(outputRoot, clientChunksDir);
  const files = (await walkFiles(chunkRoot)).filter((file) => file.endsWith('.js'));
  const sizes = await Promise.all(files.map((file) => fs.stat(file).then((stat) => stat.size).catch(() => 0)));
  return { files, totalBytes: sizes.reduce((sum, size) => sum + size, 0) };
};

export interface IMarkerHit {
  file: string;
  count: number;
}

/**
 * 파일 묶음에서 문자열을 찾는다. **정규식이 아니라 리터럴**이다 — 마커는 우리가 심은
 * 고유 토큰이고, 정규식으로 두면 마커에 든 특수문자가 조용히 뜻을 바꾼다.
 */
export const findMarker = async (files: string[], marker: string): Promise<IMarkerHit[]> => {
  const hits = await Promise.all(
    files.map(async (file) => {
      const body = await fs.readFile(file, 'utf8').catch(() => '');
      const count = body.split(marker).length - 1;
      return { file, count };
    }),
  );
  return hits.filter((hit) => hit.count > 0);
};

/** 사람이 읽는 짧은 목록. 경로는 산출 루트 기준으로 줄인다. */
export const formatHits = (hits: IMarkerHit[], outputRoot: string, limit = 5): string =>
  hits
    .slice(0, limit)
    .map((hit) => `${path.relative(outputRoot, hit.file)} ×${hit.count}`)
    .join(' · ');

/**
 * 정적으로 미리 렌더된 라우트인가.
 *
 * Next 는 빌드 때 정적으로 굳힌 App Router 라우트에 대해 `<out>/server/app/<route>.html` 을
 * 남기고, 요청마다 서버가 도는 라우트에는 남기지 않는다. **이 파일의 유무가
 * 「빌드가 초록불인데 라우트가 조용히 동적이 됐다」를 재는 유일하게 싼 증거다.**
 *
 * ⚠️ 판정 불가와 「동적이다」를 구분한다. 앱 전체에 `.html` 이 한 장도 없으면 그것은
 *    「이 라우트가 동적」이 아니라 **이 저장소에서는 이 방법으로 못 잰다**는 뜻이다.
 */
export interface IPrerenderProbe {
  /** 이 라우트의 `.html` 이 있는가. `null` 이면 판정 불가. */
  prerendered: boolean | null;
  /** 앱 전체에서 찾은 `.html` 수. 판정 불가를 사람이 보게 하려고 항상 싣는다. */
  htmlCount: number;
  detail: string;
}

export const probePrerender = async (
  outputRoot: string,
  serverOutputDir: string,
  routeSegment: string,
): Promise<IPrerenderProbe> => {
  const appOut = path.join(outputRoot, serverOutputDir, 'app');
  const htmlFiles = (await walkFiles(appOut)).filter((file) => file.endsWith('.html'));

  if (htmlFiles.length === 0) {
    return {
      prerendered: null,
      htmlCount: 0,
      detail: `${path.relative(outputRoot, appOut)} 아래에 .html 이 한 장도 없다 — 이 저장소에서는 이 방법으로 정적/동적을 못 가른다(전부 동적이거나, 산출 경로 설정이 틀렸다).`,
    };
  }

  const own = htmlFiles.some((file) => path.basename(file) === `${routeSegment}.html`);
  return {
    prerendered: own,
    htmlCount: htmlFiles.length,
    detail: own ? '' : `앱 전체 .html ${htmlFiles.length}장 중 ${routeSegment}.html 이 없다 — 이 라우트만 동적으로 굳었다.`,
  };
};
