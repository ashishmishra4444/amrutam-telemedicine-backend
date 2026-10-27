FROM node:24-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
COPY tsconfig.json ./
COPY src ./src

# Prisma needs a DATABASE_URL during schema validation.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build?schema=public"

RUN npx prisma generate
RUN npm run build


FROM node:24-alpine AS production

WORKDIR /app

ENV NODE_ENV=production
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build?schema=public"

COPY package*.json ./
RUN npm ci --omit=dev

COPY prisma ./prisma

# Include the Prisma CLI for production database migrations.
RUN npm install --no-save prisma@6.19.3
RUN npx prisma generate

COPY --from=build /app/dist ./dist

USER node

EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
