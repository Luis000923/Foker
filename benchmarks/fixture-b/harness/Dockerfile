# Imagen del agente para Fixture B (ADR-035): Node exacto de la base B (por digest) con el
# mismo Claude Code y la misma build de Foker que foker-bench (FOKER_IMAGE). Sin pnpm global:
# cada tarea activa su gestor con corepack o nub en la fase de preparación con red.
ARG NODE_IMAGE
ARG FOKER_IMAGE=foker-bench:0.0.0
FROM ${FOKER_IMAGE} AS foker
FROM ${NODE_IMAGE}
COPY --from=foker /usr/local/lib/node_modules/@anthropic-ai /usr/local/lib/node_modules/@anthropic-ai
COPY --from=foker /opt/foker /opt/foker
RUN ln -sf /usr/local/lib/node_modules/@anthropic-ai/claude-code/bin/claude.exe /usr/local/bin/claude \
  && ln -sf /opt/foker/packages/cli/dist/bin.js /usr/local/bin/foker \
  && (useradd --uid 1000 --non-unique --create-home bench 2>/dev/null || true)
ENV FOKER_BENCH_ROOT=/opt/foker
