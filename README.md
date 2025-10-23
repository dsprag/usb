# E-commerce Order Workflow Dashboards

Admin and operator dashboards for a multi-step manufacturing workflow with Shopify order sync. Operators only see work that is ready for their step; steps unlock sequentially (e.g., design → laser_cutting → assembly → shipping).

## Features
- Admin dashboard: list and Kanban by step
- Operator dashboard: per-step queue with Start/Complete actions
- Sequential workflow engine (ready → in_progress → done)
- SQLite persistence with auto-migrations
- Shopify Admin API sync (polling + manual trigger)
- .env-configurable pipeline steps

## Quick start
1. Install dependencies:
   ```bash
   npm install
   ```
2. Configure environment:
   ```bash
   cp .env.example .env
   # edit .env to set Shopify creds (optional)
   ```
3. Seed sample data (optional):
   ```bash
   npm run seed
   ```
4. Start the server:
   ```bash
   npm run dev
   # or: npm start
   ```
5. Open dashboards:
   - Admin: `http://localhost:3000/public/admin.html`
   - Operator: `http://localhost:3000/public/operator.html`

## Environment
- `PORT` server port (default 3000)
- `DB_PATH` path to sqlite database (default `./data/app.db`)
- `ORDER_PIPELINE` comma-separated steps in order (default `design,laser_cutting,assembly,shipping`)
- `SHOPIFY_STORE_DOMAIN` e.g. `your-store.myshopify.com`
- `SHOPIFY_API_VERSION` default `2023-10`
- `SHOPIFY_ADMIN_API_TOKEN` private admin token
- `SHOPIFY_POLL_INTERVAL_MS` default `300000` (5 min)

## API Overview
- GET `/api/steps` → `["design", ...]`
- GET `/api/operator/:step/orders?status=ready|in_progress|done`
- POST `/api/operator/:step/orders/:orderId/start` → start a ready step
- POST `/api/operator/:step/orders/:orderId/complete` → complete an in-progress step
- GET `/api/admin/orders` → flattened list of orders with step rows
  - optional `channel`, `step`, `stepStatus` query params
- GET `/api/admin/kanban/:step` → `{ ready: [...], in_progress: [...], done: [...] }`
- POST `/api/sync/shopify` body: `{ since?: ISO8601 }`

## Shopify Sync
- Polling starts automatically if `SHOPIFY_STORE_DOMAIN` and `SHOPIFY_ADMIN_API_TOKEN` are set.
- Manual run: `npm run sync:shopify`

## Notes
- First step is marked `ready` when an order is created. Each step unlocks when the previous is `done`.
- Operators only see items for their step and preferred status.
- This is a minimal, self-contained starter. Extend authentication/authorization, auditing, and error handling as needed for production.
