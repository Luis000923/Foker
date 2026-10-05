#!/usr/bin/env bash
# Tres preparaciones limpias por repo (E4/E8, ADR-035): install+build con red, evaluación sin red.
B=${FIXTURE_B_ROOT:-/home/luis/Documentos/foker-fixture-b}
COR='export COREPACK_HOME=$HOME/corepack PATH=$HOME/bin:$PATH && mkdir -p $HOME/bin && corepack enable --install-directory $HOME/bin'
NUB='export PATH=$HOME/.nub/bin:$PATH; command -v nub >/dev/null || bash $HOME/nub-install.sh 0.8.3'
for run in 1 2 3; do
  $B/tools/env_check.sh vite cf5c0288d526824aead1b24e977400f13c527927 node:24.16.0-bookworm "$COR && corepack prepare pnpm@12.6.0 --activate" "pnpm install --frozen-lockfile && pnpm build" "pnpm test-unit && pnpm typecheck && pnpm lint" $run
  $B/tools/env_check.sh query b90d8cee92c931773df73a39c9aa6cfc30afe5a1 node:24.16.0-bookworm "$COR && corepack prepare pnpm@12.4.2 --activate" "pnpm install --frozen-lockfile" "pnpm --filter @tanstack/query-core --filter @tanstack/react-query exec vitest run && pnpm --filter @tanstack/query-core run test:types:tscurrent && pnpm --filter @tanstack/query-core run test:eslint" $run
  $B/tools/env_check.sh zod 004d800c9e3cd4c79930f55aa4ad080225b22efd node:24.16.0-bookworm "$NUB" "nub install --frozen-lockfile && nub run build" "nub run test && nub run lint:check" $run
done
