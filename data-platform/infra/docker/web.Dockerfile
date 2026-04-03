FROM node:20-alpine

WORKDIR /workspace

RUN corepack enable

COPY package.json pnpm-workspace.yaml turbo.json /workspace/
COPY apps/web /workspace/apps/web
COPY packages /workspace/packages

RUN pnpm install
RUN pnpm --filter @data-platform/web build

WORKDIR /workspace/apps/web

CMD ["pnpm", "start"]
