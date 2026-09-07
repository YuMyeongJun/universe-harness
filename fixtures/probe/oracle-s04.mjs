/**
 * s04 **오라클 주행** — LLM 을 한 번도 부르지 않고 스테이지를 끝까지 돌린다.
 *
 * 왜 필요한가: `run` 은 에이전트 레인(`claude -p`)을 부른다. 배선이 틀렸는지 에이전트가
 * 못 푼 것인지 구분하지 못한 채 돈을 쓰면, 실패의 원인이 영원히 안 갈린다.
 * 여기서는 **정답을 사람이 넣고** step() 을 직접 돌려 두 가지를 가린다:
 *   (1) 배선 — reset/setup/게이트/채점이 실제로 도는가
 *   (2) 가해성 — 이 스테이지는 정의상 SOLVED 가 가능한가(임계값이 기준선보다 낮지 않은가)
 *
 * ⛔ 채점을 약하게 고쳐 SOLVED 를 만들지 않는다. 고치는 것은 **에이전트가 낼 답** 쪽뿐이다.
 */
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

/* 절대경로를 박지 않는다 — 우주는 자기 안에서 혼자 돌아야 한다(보존 법칙). */
const here = path.dirname(fileURLToPath(import.meta.url));
const ENGINE = path.resolve(here, '../../observatory/engine/packages/@plugins/harness-react-vite/dist/index.js');
const REPO_ROOT = path.resolve(process.argv[2] ?? path.join(here, '..', 'tiny-galaxy'));

const { ReactViteHarness, loadProjectConfig } = await import(ENGINE);

const FIXED = `interface ICatalogItem {
  id: string;
  title: string;
  price: number;
  soldOut: boolean;
}

interface ICatalogRowProps {
  data: ICatalogItem;
  selectedId: string;
  onSelect: (id: string) => void;
}

const FREE_SHIPPING_THRESHOLD = 100000;

const shippingLabelOf = (item: ICatalogItem): string => {
  if (item.soldOut) {
    return '품절';
  }
  if (item.price > FREE_SHIPPING_THRESHOLD) {
    return '무료배송';
  }
  return '배송비 3,000원';
};

export const CatalogRow = ({ data, selectedId, onSelect }: ICatalogRowProps) => {
  const isSelected = selectedId === data.id;

  return (
    <button
      type="button"
      onClick={() => onSelect(data.id)}
      aria-pressed={isSelected}
      className="flex w-full items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-left"
      data-testid="catalog-row"
    >
      <span className="flex flex-col">
        <span className="text-sm text-foreground">{data.title}</span>
        <span className="text-xs text-muted-foreground">{shippingLabelOf(data)}</span>
      </span>
      <span className="flex items-center gap-2">
        {isSelected ? <span className="text-xs text-primary">선택됨</span> : null}
      </span>
    </button>
  );
};
`;

const project = await loadProjectConfig({ repoRoot: REPO_ROOT });
console.log(`설정: ${project.configPath}`);

const harness = new ReactViteHarness({
  repoRoot: REPO_ROOT,
  paths: project.paths,
  commands: project.commands,
  lintTargets: project.lintTargets,
  testFileCommand: project.testFileCommand,
  contractPresets: project.contract.presets,
  contractStaticOnly: true, // ⛔ LLM 판정 레인 끔 — 이 주행은 0회 호출이어야 한다.
});

const started = Date.now();
const observation = await harness.reset('s04-toss-quality');
console.log(`\n── reset (${((Date.now() - started) / 1000).toFixed(1)}s)\n${observation.text}`);

const patched = await harness.step({
  kind: 'patch',
  files: [{ path: 'src/components/__harness__/CatalogRow.tsx', content: FIXED }],
  note: '오라클 정답 주입',
});
console.log(`\n── patch → ${patched.status}\n${patched.observation.text}`);
if (patched.verdict?.feedback) {
  console.log(patched.verdict.feedback);
}

const submitted = await harness.step({ kind: 'submit', note: '오라클 제출' });
console.log(`\n── submit → ${submitted.status} · reward ${submitted.reward}\n${submitted.observation.text}`);

await harness.close();
console.log(`\n총 ${((Date.now() - started) / 1000).toFixed(1)}s · 궤적 ${harness.trajectoryPath}`);
process.exitCode = submitted.status === 'SOLVED' ? 0 : 1;
