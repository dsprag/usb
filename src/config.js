require('dotenv').config();

const path = require('path');

const ORDER_PIPELINE = (process.env.ORDER_PIPELINE || 'design,laser_cutting,assembly,shipping')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

module.exports = {
  PORT: parseInt(process.env.PORT || '3000', 10),
  DB_PATH: process.env.DB_PATH || path.join(__dirname, '..', 'data', 'app.db'),
  ORDER_PIPELINE,
  SHOPIFY: {
    STORE_DOMAIN: process.env.SHOPIFY_STORE_DOMAIN || '', // e.g. myshop.myshopify.com
    API_VERSION: process.env.SHOPIFY_API_VERSION || '2023-10',
    ADMIN_API_TOKEN: process.env.SHOPIFY_ADMIN_API_TOKEN || '',
    POLL_INTERVAL_MS: parseInt(process.env.SHOPIFY_POLL_INTERVAL_MS || '300000', 10), // 5 minutes
  },
};
