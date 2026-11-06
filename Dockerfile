FROM node:22-alpine
WORKDIR /app
COPY app/package.json ./
RUN npm install --omit=dev
COPY app/ ./
COPY public/ /public/
ENV PORT=3000 \
    DATA_DIR=/app/data
VOLUME ["/app/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:3000/healthz || exit 1
CMD ["node", "src/index.js"]
