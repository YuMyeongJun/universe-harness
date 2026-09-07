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
echo; echo "✅ 주소 → 받기 → 좌표 초안. 그리고 토큰은 보지도 않는다."
