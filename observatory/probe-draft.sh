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
