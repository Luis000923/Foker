#!/usr/bin/env bash
# E4/E8 (Fixture B): instalación congelada con red y evaluación sin red en Docker,
# 2 CPU / 8 GiB. Uso: env_check.sh <nombre> <sha> <imagen> <setup> <install> <eval> <run>
# setup/install/eval son comandos bash dentro del contenedor (cwd /repo).
set -euo pipefail
name=$1 sha=$2 image=$3 setup=$4 install=$5 evalcmd=$6 run=$7
B=${FIXTURE_B_ROOT:-/home/luis/Documentos/foker-fixture-b}
out=$B/env/$name/run$run
if [ -e "$out" ]; then echo "ya existe $out: usa otro número de run (preparación limpia)" >&2; exit 2; fi
mkdir -p "$out/repo" "$out/home"
cp "$B/tools/nub-install.sh" "$out/home/nub-install.sh"
git -C "$B/repos/$name" archive "$sha" | tar -x -C "$out/repo"
common=(--rm --cpus 2 --memory 8g --user 1000:1000 -e HOME=/home/bench -e CI=1 -e TZ=UTC
  -v "$out/repo:/repo" -v "$out/home:/home/bench" -w /repo "$image")
peak='cat /sys/fs/cgroup/memory.peak 2>/dev/null || echo NA'
t0=$(date +%s)
docker run --name "fb-$name-$run-install" "${common[@]}" bash -lc "$setup && $install; rc=\$?; echo PEAK=\$($peak); exit \$rc" \
  > "$out/install.log" 2>&1 && irc=0 || irc=$?
t1=$(date +%s)
docker run --name "fb-$name-$run-eval" --network none "${common[@]}" bash -lc "$setup >/dev/null 2>&1 || true; $evalcmd; rc=\$?; echo PEAK=\$($peak); exit \$rc" \
  > "$out/eval.log" 2>&1 && erc=0 || erc=$?
t2=$(date +%s)
printf '{"name":"%s","sha":"%s","run":%s,"image":"%s","install_s":%s,"install_rc":%s,"eval_s":%s,"eval_rc":%s,"install_peak":"%s","eval_peak":"%s","lockfile_unchanged":%s}\n' \
  "$name" "$sha" "$run" "$image" $((t1 - t0)) "$irc" $((t2 - t1)) "${erc:-0}" \
  "$(grep -o 'PEAK=[0-9NA]*' "$out/install.log" | tail -1 | cut -d= -f2)" \
  "$(grep -o 'PEAK=[0-9NA]*' "$out/eval.log" | tail -1 | cut -d= -f2)" \
  "$(git -C "$B/repos/$name" show "$sha:pnpm-lock.yaml" | cmp -s - "$out/repo/pnpm-lock.yaml" && echo true || echo false)" \
  | tee "$out/result.json"
