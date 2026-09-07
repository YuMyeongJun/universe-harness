#!/usr/bin/env bash
# **초안이 도는가** — 좌표를 떠서 **실제로 걸어 보고** 관측이 파일을 보는지 잰다.
#
# ⛔ 화면 문구를 읽지 않는다. 초안대로 은하를 만들어 `observe` 를 돌리고 **그 종료코드와
#    거부 사유**를 그대로 낸다. 「코드가 없는 자리를 가리키는 좌표」는 여기서 ⚪ 3 으로 드러난다.
# ⛔ 저장소를 안 더럽힌다: 은하는 `galaxies.local/`(gitignore), config 는 끝나고 되돌린다.
# ⚠️ 대상은 `app/universe` — 코드가 `server/`·`web/` 에 있고 뿌리에 `src/` 가 **없는** 저장소다.
#    이 저장소 안에 있으니 다른 기계에서도 있다(남의 저장소에 기대지 않는다).
set -uo pipefail
cd "$(dirname "$0")/.."

if [ ! -d app/universe/server/src ]; then
  echo "⚪ 못 쟀다 — app/universe/server/src 가 없다(배달본이다)."
  exit 3
fi

# ⚠️ `mktemp` 는 **파일을 만든다** — 도구가 「이미 있다」며 덮어쓰기를 옳게 거부한다.
draft="$(mktemp -d)/draft.json"
node bin/galaxy.mjs 초안탐침 --dir app/universe --out "$draft" >/dev/null 2>&1 || {
  echo "⛔ 초안을 못 떴다"; exit 1; }

node -e '
const fs = require("node:fs");
const d = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
d.name = "초안탐침"; d.solarSystems = []; d.laws = ["naming"];
d.commands = {}; d.thresholds = {}; d.observed = {};
for (const k of Object.keys(d)) { if (k.startsWith("//") || k === "lintTargets") delete d[k]; }
fs.writeFileSync("galaxies.local/초안탐침.json", JSON.stringify(d, null, 2));
const c = JSON.parse(fs.readFileSync("universe.config.json", "utf8"));
c.galaxies.push("초안탐침");
fs.writeFileSync("universe.config.json", `${JSON.stringify(c, null, 2)}\n`);
' "$draft"

node observatory/observe.mjs --galaxy 초안탐침 > /tmp/초안탐침.txt 2>&1
code=$?

rm -f galaxies.local/초안탐침.json "$draft"
git checkout universe.config.json 2>/dev/null

cat /tmp/초안탐침.txt
if [ "$code" -eq 3 ]; then
  echo "⛔ 초안이 **코드가 없는 자리**를 가리킨다 — 그대로 등록하면 그 은하는 영원히 조용하다."
  exit 1
fi
grep -q '기준선 없음' /tmp/초안탐침.txt || { echo "⛔ 초안을 걸었는데 법칙을 하나도 못 쟀다"; exit 1; }
echo "✅ 초안대로 걸면 관측이 파일을 본다 (src/ 를 안 쓰는 저장소에서)"

# ── 둘째 경우: **일부만 봤다** ──────────────────────────────────────────────
#
# ⛔ 「전부 0개」는 위에서 잡힌다. 그런데 훑을 곳을 **여럿** 적으면 그중 하나가 오타여도
#    나머지가 파일을 내서 **조용하다** — 화면엔 그 자리가 「훑는 곳」으로 나열까지 된다.
# ⚠️ 옆 저장소 세션이 자기 검사에서 같은 형태를 찾아 줬다: 「0개면 안 봤다」 가드는
#    **통째로 못 본 것**은 잡지만 **일부만 본 것**은 못 잡는다.
cat > galaxies.local/부분탐침.json <<'JSON'
{
  "name": "부분탐침", "description": "임시 — 훑는다고 적어 놓고 비어 있는 자리", "path": ".",
  "appWorkspace": "", "appDir": "app/universe",
  "codeDirs": ["server/src", "web/src", "없는-폴더"],
  "laws": ["naming"], "commands": {}, "thresholds": {}, "solarSystems": [], "observed": {}
}
JSON
node -e '
const fs = require("node:fs");
const c = JSON.parse(fs.readFileSync("universe.config.json", "utf8"));
c.galaxies.push("부분탐침");
fs.writeFileSync("universe.config.json", `${JSON.stringify(c, null, 2)}\n`);
'
node observatory/observe.mjs --galaxy 부분탐침 > /tmp/부분탐침.txt 2>&1
partial=$?
rm -f galaxies.local/부분탐침.json
git checkout universe.config.json 2>/dev/null

if [ "$partial" -ne 3 ]; then
  cat /tmp/부분탐침.txt
  echo "⛔ **훑는다고 적어 놓고 0개인 자리**를 관측이 그냥 지나갔다(종료코드 $partial)."
  echo "   나머지 자리가 파일을 내면 수치는 멀쩡해 보인다 — 그래서 조용한 자리다."
  exit 1
fi
grep -q '파일이 0개인 자리' /tmp/부분탐침.txt || {
  echo "⛔ ⚪ 로 죽긴 했는데 **그 이유가 아니다** — 「파일이 0개인 자리」를 안 말했다"; exit 1; }
echo "✅ 훑는다고 적어 놓고 비어 있는 자리를 ⚪ 로 말한다 (일부만 본 것도 잡는다)"
