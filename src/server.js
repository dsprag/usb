const path = require('path');
const express = require('express');
const cors = require('cors');
const { PORT, DB_PATH } = require('./config');
const {
  connect,
  getPipelineSteps,
  getOperatorOrders,
  getAdminOrders,
  getKanbanForStep,
  setStepStatus,
  seedOrders,
} = require('./db');
const { syncShopifyOnce, startPolling } = require('./services/shopify');

const db = connect(DB_PATH);

// Seed minimal data if DB is empty
const anyOrder = db.prepare('SELECT id FROM orders LIMIT 1').get();
if (!anyOrder) {
  seedOrders(db, 8);
}

const app = express();
app.use(cors());
app.use(express.json());
app.use('/public', express.static(path.join(__dirname, '..', 'public')));

// Health
app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

// Pipeline steps
app.get('/api/steps', (req, res) => {
  res.json(getPipelineSteps());
});

// Operator endpoints
app.get('/api/operator/:step/orders', (req, res) => {
  const { step } = req.params;
  const { status = 'ready' } = req.query;
  try {
    const rows = getOperatorOrders(db, step, status);
    res.json(rows);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/operator/:step/orders/:orderId/start', (req, res) => {
  const { step, orderId } = req.params;
  try {
    setStepStatus(db, Number(orderId), step, 'in_progress');
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/operator/:step/orders/:orderId/complete', (req, res) => {
  const { step, orderId } = req.params;
  try {
    setStepStatus(db, Number(orderId), step, 'done');
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Admin endpoints
app.get('/api/admin/orders', (req, res) => {
  const { channel, step, stepStatus } = req.query;
  try {
    const rows = getAdminOrders(db, {
      channel: channel || undefined,
      step: step || undefined,
      stepStatus: stepStatus || undefined,
    });
    res.json(rows);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get('/api/admin/kanban/:step', (req, res) => {
  const { step } = req.params;
  try {
    const board = getKanbanForStep(db, step);
    res.json(board);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Manual Shopify sync
app.post('/api/sync/shopify', async (req, res) => {
  try {
    const { since } = req.body || {};
    const result = await syncShopifyOnce(db, since);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Root pages helpers
app.get('/', (req, res) => {
  res.redirect('/public/admin.html');
});

// Start polling Shopify if configured
const stopPolling = startPolling(db);

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server listening on http://localhost:${PORT}`);
});
