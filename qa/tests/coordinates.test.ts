/**
 * 좌표 관문 — 이 기계에만 있는 것이 커밋에 섞이지 않는지 **구조로** 잰다.
 *
 * ⛔ 회사 이름을 열거해 막지 않는다. 목록 방식은 **다음 이름을 못 막는다.**
 *    「절대 경로는 그 기계에만 있다」는 성질로 잰다.
 *
 * ⚠️ 트리에서 지워도 **이미 밀린 커밋엔 남는다.** 처음부터 안 넣는 것이 유일한 답이라
 *    이 검사는 커밋 전에 문다.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..');

/** 사용자 홈 아래 절대 경로 — 그 기계에만 있다 */
const ABSOLUTE_HOME = /(?:\/Users\/[A-Za-z0-9._-]+\/|\/home\/[A-Za-z0-9._-]+\/|[A-Z]:\\Users\\)/;

/** 이 파일 자신은 그 패턴을 정의하므로 제외한다 */
const SELF = 'tests/coordinates.test.ts';

const trackedFiles = (): string[] =>
  execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' })
    .split('\0')
    .filter((f) => f !== '' && f !== SELF);

const isText = (file: string): boolean => {
  const path = join(ROOT, file);
  try {
    if (statSync(path).size > 512 * 1024) return false;
  } catch {
    return false;
  }
  return /\.(ts|tsx|js|mjs|cjs|json|md|ya?ml|txt)$/.test(file);
};

describe('좌표 관문', () => {
  it('추적되는 파일에 절대 경로가 없다', () => {
    const offenders: string[] = [];
    for (const file of trackedFiles()) {
      if (!isText(file)) continue;
      const source = readFileSync(join(ROOT, file), 'utf8');
      for (const [i, line] of source.split(/\r?\n/).entries()) {
        if (ABSOLUTE_HOME.test(line)) offenders.push(`${file}:${i + 1}`);
      }
    }
    expect(
      offenders,
      `절대 경로가 커밋에 섞였다:\n  ${offenders.join('\n  ')}\n` +
        '그 기계에만 있는 경로다. 상대 경로로 바꾸거나 gitignore 되는 로컬 설정으로 옮겨라.\n' +
        '⚠️ 이미 푸시했다면 트리에서 지워도 히스토리에는 남는다.',
    ).toEqual([]);
  });

  it('검사가 실제로 파일을 봤다 — 0개면 통과가 아니다', () => {
    // 스캔 대상이 0개면 "위반 없음"이 아니라 검사가 아무것도 안 본 것이다.
    const scanned = trackedFiles().filter(isText);
    expect(scanned.length).toBeGreaterThan(10);
  });

  it('탐지기가 살아 있다 — 심어 놓은 절대 경로를 잡는다', () => {
    // 검사가 죽어 있으면 "위반 0건"이 영원히 초록으로 보인다. 합성 표본으로 증명한다.
    expect(ABSOLUTE_HOME.test('const p = "/Users/someone/work/x"')).toBe(true);
    expect(ABSOLUTE_HOME.test('const p = "/home/someone/work/x"')).toBe(true);
    expect(ABSOLUTE_HOME.test('const p = "C:\\Users\\someone"')).toBe(true);
    expect(ABSOLUTE_HOME.test('const p = "./relative/path"')).toBe(false);
  });
});
