# ── 1단계: 빌드 ────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci                    # package-lock.json 기반으로 정확히 설치

COPY . .
RUN npm run build             # /app/dist 생성

# ── 2단계: 서빙 ────────────────────────────────────────────────────────────────
FROM nginx:alpine

# 빌드 결과물 복사
COPY --from=builder /app/dist /usr/share/nginx/html

# Nginx 설정 복사
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
