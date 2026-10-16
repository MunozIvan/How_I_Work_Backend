# How I Work Backend

Hi! I'm Iván, a Backend Engineer from Buenos Aires.

Most of the backend work I've done professionally is private, so I wanted a public project where people could actually see how I work. That's why I built this e-commerce to share how I approach backend architecture and code organization.

## Stack

Node.js 22 · TypeScript · Express 5 · MySQL 8 · Redis 7 · JWT · Vitest + Supertest · Docker

## How I organize the code

I group the code by **feature**, not by file type. Everything related to orders lives in `modules/orders`, so when I need to change something I don't have to jump between five folders.

```
src/
├── modules/
│   ├── auth/
│   ├── products/
│   ├── cart/
│   └── orders/
├── middlewares/     # auth, rate limit, error handler
├── db/              # MySQL pool and Redis client
├── config/          # env vars, validated on startup
└── utils/
```

Inside each module I always use the same layers, and each one has a single job:

```
request -> routes -> controller -> service -> MySQL / Redis
```

- `*.routes.ts`: just the map of endpoints. Which URL, which middlewares (auth, roles, rate limit) and which controller. Opening this file tells you everything the module exposes.
- `*.controller.ts`: the HTTP layer. Validates the input with the schemas, calls the service and decides the status code and the response. No business logic here.
- `*.service.ts`: the actual logic and the SQL queries. It doesn't know about `req` or `res`, so it's easy to reuse and test.
- `*.schemas.ts`: Zod schemas. Everything that comes from outside (body, query params, env vars) gets validated before I use it, and the TypeScript types come from the same schemas so I don't write them twice.

Errors are thrown as `HttpError` from anywhere, and one middleware at the end turns them into a consistent JSON response. That way the controllers stay short and I don't have try/catch everywhere (Express 5 already forwards errors from async handlers).

## Some decisions and why

**Plain SQL instead of an ORM.** For a project this size I prefer seeing exactly which query runs. It also forces me to think about indexes, joins and transactions, which is where most backend bugs live anyway.

**Checkout inside a transaction with `SELECT ... FOR UPDATE`.** This was the part I cared about most. When someone buys, the product rows are locked until the order is saved, so two checkouts can't sell the same stock. I lock them sorted by id to avoid deadlocks, and prices are always read from the DB, never from what the client sends.

**The cart lives in Redis, not in MySQL.** A cart is temporary data that changes a lot. In Redis it's a hash per user with a 7-day expiration, so abandoned carts clean themselves up.

**Cache with a version number.** Product lists are cached in Redis. Invalidating them was the tricky part, since there are many combinations of filters and pages. So every key includes a version (`products:v3:...`), and when a product changes I just increase the version. The old keys are never read again and expire on their own. You can see if a response came from the cache in the `X-Cache` header.

**Small security details.** Login has a rate limit (also in Redis), login errors don't tell you if the email exists, and if you ask for someone else's order you get a 404 instead of a 403, so you can't even confirm it exists.

**Prices in cents.** Money is stored as integers. Floats and money don't mix well. (I had bad experiences before hahaha)

## Running it

You need Node 20+ and Docker.

```bash
npm install
cp .env.example .env
docker compose up -d     # MySQL + Redis, the schema is created automatically
npm run seed             # admin user and some sample products
npm run dev
```

The API runs on http://localhost:3000 and `/health` tells you if MySQL and Redis are up.

The seed creates an admin user: `admin@example.com` / `Admin1234!`

## Tests

I prefer integration tests here: they hit the real API with a real MySQL and Redis, because most of what can break in this project is in the queries and in the interaction between the two. They use a separate database (`ecommerce_test`) and another Redis DB, so they don't touch the dev data.

```bash
docker compose up -d
npm test
```


If you have any feedback or questions about why I did something a certain way, feel free to reach out on [LinkedIn](https://www.linkedin.com/in/ivanmg-f-s-developer/).
