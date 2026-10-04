# Construir fuera del sandbox con las fuentes y estos cambios.
FROM node:22.14.0-bookworm AS build
ARG CLAUDE_CODE_VERSION
RUN test -n "$CLAUDE_CODE_VERSION" && apt-get update && apt-get install -y --no-install-recommends git curl build-essential ca-certificates && rm -rf /var/lib/apt/lists/*
RUN npm install --global pnpm@11.9.0 @openai/codex@0.159.3 @anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}
ENV RUSTUP_HOME=/opt/rustup CARGO_HOME=/opt/cargo PATH=/opt/cargo/bin:$PATH
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain 1.98.0 --profile minimal
WORKDIR /opt/foker
COPY . .
RUN pnpm install --frozen-lockfile && pnpm build:native && pnpm build
RUN ./node_modules/.bin/tsc -p benchmarks/docker/tsconfig.json
RUN node benchmarks/fixtures/fixture-a/generate.mjs /opt/fixture 42 && cd /opt/fixture && pnpm install
FROM node:22.14.0-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build /usr/local/lib/node_modules /usr/local/lib/node_modules
COPY --from=build /opt/foker/node_modules /opt/foker/node_modules
COPY --from=build /opt/foker/packages /opt/foker/packages
# Enlaces de workspace del paquete de benchmarks (@foker/engine, @foker/core…) para el evaluador.
COPY --from=build /opt/foker/benchmarks/node_modules /opt/foker/benchmarks/node_modules
COPY --from=build /opt/foker/benchmarks/package.json /opt/foker/benchmarks/package.json
COPY --from=build /opt/fixture/node_modules /opt/fixture/node_modules
COPY --from=build /opt/fixture/pnpm-lock.yaml /opt/fixture/pnpm-lock.yaml
COPY --from=build /opt/foker/benchmarks/docker/compiled /opt/foker/benchmarks/docker/compiled
COPY benchmarks/docker/*.mjs /opt/foker/benchmarks/docker/
# Los parches gold y tests ocultos se montan únicamente para evaluar.
RUN ln -s /usr/local/lib/node_modules/pnpm/bin/pnpm.cjs /usr/local/bin/pnpm && ln -s /usr/local/lib/node_modules/pnpm/bin/pnpx.cjs /usr/local/bin/pnpx && ln -s /usr/local/lib/node_modules/@anthropic-ai/claude-code/bin/claude.exe /usr/local/bin/claude && chmod +x /opt/foker/packages/cli/dist/bin.js && ln -s /opt/foker/packages/cli/dist/bin.js /usr/local/bin/foker
RUN ln -s /usr/local/lib/node_modules/@openai/codex/bin/codex.js /usr/local/bin/codex
RUN useradd --uid 1000 --non-unique --create-home bench && chmod -R a+rX /opt/foker /opt/fixture
ENV FOKER_BENCH_ROOT=/opt/foker
USER bench
WORKDIR /work
