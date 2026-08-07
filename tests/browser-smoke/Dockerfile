FROM mcr.microsoft.com/playwright:v1.62.1-noble

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

WORKDIR /smoke

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --chown=pwuser:pwuser smoke.mjs fixture.mjs ./

USER pwuser

CMD ["node", "smoke.mjs"]
