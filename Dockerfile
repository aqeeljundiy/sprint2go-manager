# Sprint2go: one container with the built app, its server and the mail engine (SMTP on 25). Data lives in /app/data.
FROM node:24-alpine
RUN apk add --no-cache openssl
RUN (apk add --no-cache libgcc libstdc++ ripgrep && adduser -D -H -s /sbin/nologin aitool) || echo "AI sign-in tool extras not installed"
# The sign-in tools for the owner's AI subscriptions (/admin, AI, Subscriptions; server/aiAccounts.ts): Claude Code and
# Codex. Never fatal: without them the app runs as before and the page says the tool is missing (API keys still work).
RUN npm install -g --no-audit --no-fund @anthropic-ai/claude-code @openai/codex || echo "AI sign-in tools not installed"
ENV DISABLE_AUTOUPDATER=1 USE_BUILTIN_RIPGREP=0
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build
ENV NODE_ENV=production PORT=8787 HOST=0.0.0.0 S2G_DATA=/app/data
EXPOSE 8787 25
# Virus scanning of mail attachments (optional, server/mailFiles.ts): run ClamAV next to this container, e.g. the
# clamav/clamav image as a sidecar (it needs about 1.5 GB of memory for its signatures), and set CLAMD_HOST to its
# clamd address ("clamav:3310", or a socket path). Without it everything works and files are marked "Not scanned".
# See docs/mail-attachments.md.
VOLUME ["/app/data"]
CMD ["node", "--import", "./server/register.mjs", "server/index.ts"]
