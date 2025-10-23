const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const { ORDER_PIPELINE } = require('./config');

const defaultDbPath = path.join(__dirname, '..', 'data', 'app.db');

function connect(dbPath = defaultDbPath) {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');
  migrate(db);
  return db;
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel TEXT NOT NULL,
      external_id TEXT NOT NULL,
      order_number TEXT,
      customer_name TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      raw_json TEXT,
      UNIQUE(channel, external_id)
    );

    CREATE TABLE IF NOT EXISTS order_steps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      step TEXT NOT NULL,
      position INTEGER NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending','ready','in_progress','done')),
      operator_id TEXT,
      ready_at TEXT,
      started_at TEXT,
      completed_at TEXT,
      FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE,
      UNIQUE(order_id, step)
    );

    CREATE INDEX IF NOT EXISTS idx_order_steps_step_status ON order_steps(step, status);
    CREATE INDEX IF NOT EXISTS idx_order_steps_order ON order_steps(order_id);
  `);
}

function upsertOrder(db, order) {
  // order: { channel, external_id, order_number, customer_name, created_at, updated_at, raw_json }
  const insert = db.prepare(`
    INSERT INTO orders(channel, external_id, order_number, customer_name, status, created_at, updated_at, raw_json)
    VALUES (@channel, @external_id, @order_number, @customer_name, COALESCE(@status,'open'), @created_at, @updated_at, @raw_json)
    ON CONFLICT(channel, external_id) DO UPDATE SET
      order_number=excluded.order_number,
      customer_name=excluded.customer_name,
      updated_at=excluded.updated_at,
      raw_json=excluded.raw_json
  `);
  const info = insert.run(order);

  const row = db.prepare(`SELECT id FROM orders WHERE channel=? AND external_id=?`).get(order.channel, order.external_id);
  const orderId = row.id;

  // Ensure steps exist for this order
  ensureStepsForOrder(db, orderId, ORDER_PIPELINE);

  return orderId;
}

function ensureStepsForOrder(db, orderId, steps) {
  const existsStmt = db.prepare(`SELECT COUNT(1) as c FROM order_steps WHERE order_id=?`);
  const { c } = existsStmt.get(orderId);
  if (c > 0) return;

  const insert = db.prepare(`
    INSERT INTO order_steps(order_id, step, position, status)
    VALUES (?, ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    steps.forEach((s, i) => {
      const status = i === 0 ? 'ready' : 'pending';
      insert.run(orderId, s, i, status);
    });
  });
  tx();
}

function getPipelineSteps() {
  return ORDER_PIPELINE.slice();
}

function getOperatorOrders(db, step, status = 'ready') {
  const stmt = db.prepare(`
    SELECT os.id as step_id, o.id as order_id, o.order_number, o.customer_name, os.status, os.position
    FROM order_steps os
    JOIN orders o ON o.id = os.order_id
    WHERE os.step = ? AND os.status = ?
    ORDER BY o.created_at ASC
  `);
  return stmt.all(step, status);
}

function getAdminOrders(db, filters = {}) {
  const clauses = [];
  const params = [];
  if (filters.channel) { clauses.push('o.channel = ?'); params.push(filters.channel); }
  if (filters.step) { clauses.push('os.step = ?'); params.push(filters.step); }
  if (filters.stepStatus) { clauses.push('os.status = ?'); params.push(filters.stepStatus); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const sql = `
    SELECT o.id as order_id, o.channel, o.external_id, o.order_number, o.customer_name, o.created_at, o.updated_at,
           os.step, os.status as step_status, os.position
    FROM orders o
    LEFT JOIN order_steps os ON os.order_id = o.id
    ${where}
    ORDER BY o.created_at DESC, os.position ASC
  `;
  return db.prepare(sql).all(...params);
}

function getKanbanForStep(db, step) {
  const statuses = ['ready', 'in_progress', 'done'];
  const result = { ready: [], in_progress: [], done: [] };
  const stmt = db.prepare(`
    SELECT os.id as step_id, o.id as order_id, o.order_number, o.customer_name, os.status
    FROM order_steps os
    JOIN orders o ON o.id = os.order_id
    WHERE os.step = ? AND os.status = ?
    ORDER BY o.created_at ASC
  `);
  statuses.forEach((s) => {
    result[s] = stmt.all(step, s);
  });
  return result;
}

function setStepStatus(db, orderId, step, newStatus, operatorId = null) {
  const valid = ['pending', 'ready', 'in_progress', 'done'];
  if (!valid.includes(newStatus)) throw new Error('Invalid status');

  const now = new Date().toISOString();
  const row = db.prepare(`SELECT * FROM order_steps WHERE order_id=? AND step=?`).get(orderId, step);
  if (!row) throw new Error('Step not found');

  const update = db.prepare(`
    UPDATE order_steps
    SET status = @status,
        operator_id = COALESCE(@operator_id, operator_id),
        ready_at = CASE WHEN @status='ready' THEN @now ELSE ready_at END,
        started_at = CASE WHEN @status='in_progress' THEN @now ELSE started_at END,
        completed_at = CASE WHEN @status='done' THEN @now ELSE completed_at END
    WHERE order_id = @order_id AND step = @step
  `);

  const tx = db.transaction(() => {
    // Guard transitions
    if (newStatus === 'in_progress' && row.status !== 'ready') {
      throw new Error('Can only start when ready');
    }
    if (newStatus === 'done' && row.status !== 'in_progress') {
      throw new Error('Can only complete when in progress');
    }

    update.run({ status: newStatus, operator_id: operatorId, now, order_id: orderId, step });

    if (newStatus === 'done') {
      // Advance next step to ready if all prior steps are done
      const next = db.prepare(`SELECT * FROM order_steps WHERE order_id=? AND position=?`).get(orderId, row.position + 1);
      if (next && next.status === 'pending') {
        db.prepare(`UPDATE order_steps SET status='ready', ready_at=? WHERE id=?`).run(now, next.id);
      }
    }
  });

  tx();
}

function seedOrders(db, count = 6) {
  const now = new Date();
  const insertOrder = db.prepare(`
    INSERT INTO orders(channel, external_id, order_number, customer_name, status, created_at, updated_at, raw_json)
    VALUES (?, ?, ?, ?, 'open', ?, ?, NULL)
  `);

  for (let i = 0; i < count; i += 1) {
    const createdAt = new Date(now.getTime() - i * 3600_000).toISOString();
    const updatedAt = createdAt;
    const extId = `seed-${i + 1}`;
    const info = insertOrder.run('seed', extId, `S-${1000 + i}`, `Customer ${i + 1}`, createdAt, updatedAt);
    const orderId = info.lastInsertRowid;
    ensureStepsForOrder(db, orderId, ORDER_PIPELINE);
  }
}

module.exports = {
  connect,
  migrate,
  upsertOrder,
  ensureStepsForOrder,
  getPipelineSteps,
  getOperatorOrders,
  getAdminOrders,
  getKanbanForStep,
  setStepStatus,
  seedOrders,
};
