FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run typecheck && npx vite build

FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl git gosu tini poppler-utils tesseract-ocr tesseract-ocr-eng && rm -rf /var/lib/apt/lists/*
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
RUN ./node_modules/.bin/playwright install --with-deps chromium && chmod -R a+rX /ms-playwright
USER node
ARG CLAUDE_VERSION=2.1.278
RUN curl -fsSL https://claude.ai/install.sh -o /tmp/install-claude.sh && bash /tmp/install-claude.sh "$CLAUDE_VERSION" && rm /tmp/install-claude.sh
USER root
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/dist/client ./dist/client
COPY --from=build /app/server ./server
COPY --from=build /app/shared ./shared
COPY --from=build /app/scripts/start-hosted.ts ./scripts/start-hosted.ts
COPY deploy/entrypoint.sh /usr/local/bin/groundwork-entrypoint
ENV NODE_ENV=production GROUNDWORK_HOSTED=true
EXPOSE 4318
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/groundwork-entrypoint"]
CMD ["node", "--import", "tsx", "scripts/start-hosted.ts"]
