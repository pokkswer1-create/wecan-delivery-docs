FROM ghcr.io/puppeteer/puppeteer:23.11.1

USER root
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY generate.js pdf.js server.js ./
COPY public ./public
COPY assets ./assets

RUN mkdir -p out tmp && chown -R pptruser:pptruser /app

USER pptruser

ENV NODE_ENV=production
ENV PORT=3780
EXPOSE 3780

CMD ["node", "server.js"]
