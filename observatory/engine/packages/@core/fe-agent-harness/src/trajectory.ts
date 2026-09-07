/**
 * 궤적 기록 — JSONL 한 줄이 한 사건이다.
 *
 * 이 파일이 **WikiSkill 추출의 유일한 입력**이다. 그래서 여기서 줄이면 그만큼 지식이 준다:
 * Contract 반려 사유·probe 명령·최종 diff 는 전부 남긴다. 요약해서 넣지 마라.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

import type { ITrajectoryRecorder } from './types.ts';

export const createTrajectoryRecorder = (options: {
  dir: string;
  runId: string;
  stageId: string;
}): ITrajectoryRecorder => {
  const filePath = path.join(options.dir, `${options.runId}.jsonl`);

  return {
    path: filePath,
    append: async (entry) => {
      await fs.mkdir(options.dir, { recursive: true });
      await fs.appendFile(
        filePath,
        /* ⚠️ `at` 은 **줄이 자기 시각을 들고 있게** 하려고 있다. 없었을 때 시간원은
           파일 mtime 뿐이었고, mtime 은 `git checkout`·복사·변이 시험의 복원이 새로 찍는다
           — `--since` 로 자른 범위가 조용히 달라진다(R81 이 dist 검사에서 겪은 함정과 같다). */
        `${JSON.stringify({ at: new Date().toISOString(), runId: options.runId, stageId: options.stageId, ...entry })}\n`,
        'utf8',
      );
    },
  };
};
