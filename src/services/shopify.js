const axios = require('axios');
const { SHOPIFY } = require('../config');
const { upsertOrder } = require('../db');

function getAxios() {
  if (!SHOPIFY.STORE_DOMAIN || !SHOPIFY.ADMIN_API_TOKEN) return null;
  const baseURL = `https://${SHOPIFY.STORE_DOMAIN}/admin/api/${SHOPIFY.API_VERSION}`;
  return axios.create({
    baseURL,
    headers: {
      'X-Shopify-Access-Token': SHOPIFY.ADMIN_API_TOKEN,
      'Content-Type': 'application/json',
    },
  });
}

async function syncShopifyOnce(db, sinceIso) {
  const client = getAxios();
  if (!client) {
    return { ok: false, reason: 'Shopify not configured' };
  }

  let pageInfo = null;
  let newOrUpdated = 0;
  const params = {
    status: 'any',
    limit: 100,
  };
  if (sinceIso) params.updated_at_min = sinceIso;

  // Simple one-page fetch; extend with pagination if needed via Link headers
  const res = await client.get('/orders.json', { params });
  const orders = res.data.orders || [];
  orders.forEach((o) => {
    const orderPayload = {
      channel: 'shopify',
      external_id: String(o.id),
      order_number: String(o.order_number || o.name || o.id),
      customer_name: o.customer ? `${o.customer.first_name || ''} ${o.customer.last_name || ''}`.trim() : 'Guest',
      created_at: o.created_at,
      updated_at: o.updated_at,
      raw_json: JSON.stringify(o),
    };
    upsertOrder(db, orderPayload);
    newOrUpdated += 1;
  });

  return { ok: true, newOrUpdated };
}

function startPolling(db, logger = console) {
  if (!SHOPIFY.STORE_DOMAIN || !SHOPIFY.ADMIN_API_TOKEN) {
    logger.log('Shopify polling disabled: missing configuration');
    return () => {};
  }
  let lastSync = null;
  const run = async () => {
    try {
      const since = lastSync ? new Date(lastSync).toISOString() : undefined;
      const res = await syncShopifyOnce(db, since);
      lastSync = new Date().toISOString();
      logger.log(`Shopify sync: ${res.ok ? 'ok' : 'failed'}; updated=${res.newOrUpdated || 0}`);
    } catch (err) {
      logger.error('Shopify sync error:', err.message);
    }
  };
  run();
  const id = setInterval(run, SHOPIFY.POLL_INTERVAL_MS);
  return () => clearInterval(id);
}

module.exports = { syncShopifyOnce, startPolling };
