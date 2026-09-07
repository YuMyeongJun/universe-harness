#!/usr/bin/env bash
# **주소 하나로 좌표까지 나오는가** — 사람의 계획 첫 칸을 실제로 밟는다.
#
# ⛔ 네트워크를 안 쓴다. **로컬 저장소를 `file://` 로** 받는다 — 인터넷이 없어도, 어느 기계에서도
#    같은 답이 나온다(실측이 기계와 회선에 안 매인다).
# ⛔ 토큰을 안 만든다. 이 도구는 애초에 토큰을 안 받는다 — 그 거절도 여기서 잰다.
set -uo pipefail
cd "$(dirname "$0")/.."

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
src="$work/src"; got="$work/got"

mkdir -p "$src/src/pages"
cat > "$src/package.json" <<'JSON'
{ "name": "probe-app", "scripts": { "typecheck": "tsc --noEmit", "build": "vite build" } }
JSON
echo 'export const A = () => <div className="p-[3px]" />;' > "$src/src/pages/A.tsx"
git -C "$src" init -q .
git -C "$src" add -A
git -C "$src" -c user.email=a@b -c user.name=t commit -qm init || { echo "⚪ 못 쟀다 — git 이 커밋을 못 했다"; exit 3; }

fail=0
say () { echo "  $1"; }

# ① 주소 하나로 받아 와서 **좌표 초안까지** 나오는가
if node bin/clone.mjs "file://$src" --into "$got" --name probeapp > "$work/out.txt" 2>&1; then
  if [ -f "$got/universe-galaxy.json" ] && [ -f "$got/src/pages/A.tsx" ]; then
    say "✅ 주소 하나로 받아 오고 좌표 초안까지 낸다"
  else
    say "⛔ 받기는 했는데 **좌표 초안이 없다**"; fail=1
  fi
else
  cat "$work/out.txt"; say "⛔ 받아 오지 못했다"; fail=1
fi

# ② ⛔ **자격이 박힌 주소를 거절하는가** — 셸 히스토리·프로세스 목록에 남는 자리다
# ⛔ **도구가 뭐라고 하는지**로 잰다 — 종료코드로 재면 git 이 대신 죽은 것과 구별이 안 된다.
#    (실측: 거절 갈래를 꺼도 `example.invalid` 를 못 받아 exit≠0 이 났다. 「죽었다」는 판정이 아니다.)
node bin/clone.mjs "https://TOKEN@example.invalid/x/y.git" --into "$work/n1" >"$work/o2.txt" 2>&1
if grep -q '자격이 박혀 있다' "$work/o2.txt"; then
  say "✅ 자격이 박힌 주소를 거절한다"
else
  say "⛔ **자격이 박힌 주소**를 안 막았다 — 토큰이 셸 히스토리와 프로세스 목록에 남는다"
  say "   (죽기는 했을 수 있다. 그건 git 이 대신 죽은 것이지 이 도구가 막은 것이 아니다.)"
  cat "$work/o2.txt"; fail=1
fi

# ③ ⛔ **토큰 플래그를 아예 안 받는가**
if node bin/clone.mjs "file://$src" --token abc --into "$work/n2" >"$work/o3.txt" 2>&1; then
  say "⛔ **--token 을 받아들였다** — 이 도구는 토큰을 보면 안 된다"; fail=1
else
  grep -q '모르는 플래그 --token' "$work/o3.txt" \
    && say "✅ --token 을 모르는 플래그로 거절한다" \
    || { say "⛔ 거절 이유가 다르다"; cat "$work/o3.txt"; fail=1; }
fi

# ④ ⛔ **안 빈 자리를 덮어쓰지 않는가** — 「받아 오기」가 「지우기」가 되면 안 된다
if node bin/clone.mjs "file://$src" --into "$got" >"$work/o4.txt" 2>&1; then
  say "⛔ **이미 무언가 있는 자리에 받았다** — 남의 작업을 덮을 수 있다"; fail=1
else
  grep -q '이미 무언가 있다' "$work/o4.txt" \
    && say "✅ 안 빈 자리를 거절한다" \
    || { say "⛔ 거절 이유가 다르다"; cat "$work/o4.txt"; fail=1; }
fi

if [ "$fail" -ne 0 ]; then
  echo; echo "⛔ 사람의 계획 첫 칸(주소를 넣는다)이 거짓이다."
  exit 1
fi
# ── 다섯째: **들이기까지 이어지는가** (`universe adopt`) ─────────────────────
#
# ⛔ 도구가 스스로 경고하던 자리다: 「목록에 이름을 안 올리면 관측이 **아무것도 안 재고 초록불**」.
#    그 경고를 사람 손에 맡기고 있었다 — 손으로 두 자리를 고치는 일이고, 한 자리만 고치면 그 사고다.
# ⛔ 우주의 진짜 `universe.config.json` 을 건드리지 않는다. **복사본 우주**를 만들어 거기서 잰다.
home="$work/home"
mkdir -p "$home/galaxies" "$home/galaxies.local"
cp universe.config.json "$home/universe.config.json"
node -e '
const fs = require("node:fs");
const c = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
c.galaxies = [];
fs.writeFileSync(process.argv[1], `${JSON.stringify(c, null, 2)}\n`);
' "$home/universe.config.json"

# ① TODO 가 남았으면 **들이지 않는다**
if node bin/adopt.mjs "$got/universe-galaxy.json" --universe "$home" >"$work/o5.txt" 2>&1; then
  say "⛔ **TODO 가 남은 초안을 들였다** — 관문이 엉뚱한 것을 재게 된다"; fail=1
else
  grep -q '사람이 채울 자리가' "$work/o5.txt" \
    && say "✅ TODO 가 남은 초안은 안 들인다" \
    || { say "⛔ 거절 이유가 다르다"; cat "$work/o5.txt"; fail=1; }
fi

# ② 채우면 **좌표를 두고 목록에 올린다** — 두 자리가 같이 움직여야 한다
node -e '
const fs = require("node:fs");
const p = process.argv[1];
const fill = (o) => (typeof o === "string" ? (o.startsWith("TODO:") ? "채웠다" : o)
  : Array.isArray(o) ? o.map(fill)
  : o && typeof o === "object" ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, fill(v)])) : o);
const d = fill(JSON.parse(fs.readFileSync(p, "utf8")));
d.solarSystems = [{ name: "pages", description: "화면", srcDir: "src/pages" }];
fs.writeFileSync(p, JSON.stringify(d, null, 2));
' "$got/universe-galaxy.json"

if node bin/adopt.mjs "$got/universe-galaxy.json" --universe "$home" >"$work/o6.txt" 2>&1; then
  listed=$(node -e 'process.stdout.write(String(JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8")).galaxies.includes("probeapp")))' "$home/universe.config.json")
  if [ -f "$home/galaxies.local/probeapp.json" ] && [ "$listed" = "true" ]; then
    say "✅ 좌표를 두고 **목록에도 올린다** (한 자리만 고쳐지면 그게 R121 의 사고다)"
  else
    say "⛔ 좌표와 목록이 **같이 안 움직였다** — 좌표 $( [ -f "$home/galaxies.local/probeapp.json" ] && echo 있음 || echo 없음) · 목록 $listed"; fail=1
  fi
else
  cat "$work/o6.txt"; say "⛔ 채운 초안을 못 들였다"; fail=1
fi

# ③ ⛔ **커밋되는 자리에 쓰지 않는가** — 절대 경로가 든 좌표는 그 기계의 것이다
[ -f "$home/galaxies/probeapp.json" ] \
  && { say "⛔ **커밋되는 galaxies/ 에 썼다** — 좌표 감사가 무는 자리다"; fail=1; } \
  || say "✅ 커밋되는 galaxies/ 에는 안 쓴다"

# ④ ⛔ **덮어쓰지 않는가**
if node bin/adopt.mjs "$got/universe-galaxy.json" --universe "$home" >"$work/o7.txt" 2>&1; then
  say "⛔ **이미 있는 은하를 덮어썼다**"; fail=1
else
  grep -q '이미 있는 은하다' "$work/o7.txt" \
    && say "✅ 이미 있는 은하는 안 덮어쓴다" \
    || { say "⛔ 거절 이유가 다르다"; cat "$work/o7.txt"; fail=1; }
fi

# ── 여섯째: **화면 시험 축을 제안하는가** ────────────────────────────────
#
# ⛔ 실측(R163): 등록된 은하 **하나도** `commands.e2e` 를 선언하지 않아 그 축이 **한 번도 안 돌았다**.
#    ⚪ 는 정직하지만 **너무 자주 나오면 사람이 읽지 않는 법부터 배운다.**
#    ⇒ ⚪ 를 예쁘게 찍는 대신 **⚪ 가 나오는 조건 자체를 줄인다.**
# ⛔ 스크립트 **이름**으로 찾지 않는다(§9) — 여기서 이름을 **한글**로 두어 그걸 못 박는다.
e2erepo="$work/e2erepo"; mkdir -p "$e2erepo/src/pages"
echo 'export const A = () => <div/>;' > "$e2erepo/src/pages/A.tsx"
printf '%s\n' '{"name":"a","scripts":{"화면시험":"playwright test --project=chromium"}}' > "$e2erepo/package.json"

node bin/galaxy.mjs e2eprobe --dir "$e2erepo" --out "$work/e2e.json" >/dev/null 2>&1
found=$(node -e '
const d = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8"));
process.stdout.write(String(d.commands?.e2e ?? ""));
' "$work/e2e.json")
case "$found" in
  *playwright*--reporter=json*) say "✅ 화면 시험 축을 **JSON 리포터로** 제안한다 (이름이 한글이어도 찾는다)" ;;
  TODO:*)  say "⛔ playwright 를 부르는 스크립트가 있는데 **못 찾았다** — 이름으로 찾고 있다(§9)"; fail=1 ;;
  *)       say "⛔ 축을 적긴 했는데 **JSON 리포터가 아니다**: $found — `universe loop` 가 리포트를 못 읽는다"; fail=1 ;;
esac

if [ "$fail" -ne 0 ]; then
  echo; echo "⛔ 사람의 계획 첫 칸(주소를 넣는다)이 거짓이다."
  exit 1
fi
echo; echo "✅ 주소 → 받기 → 좌표 초안 → 들이기. 그리고 토큰은 보지도 않는다."
