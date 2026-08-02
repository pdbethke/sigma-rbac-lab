# Retail inventory (Prisma + SQLite)

Install dependencies with `npm install`, copy `.env.example` to `.env`, then run
`npx prisma migrate dev --name init` (or `npx prisma db push`) and
`npm run generate`.

The page queries are exported from [`src/queries.ts`](src/queries.ts). Each
function accepts a `PrismaClient` (or transaction client) as its first argument.
