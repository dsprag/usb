const { connect, seedOrders } = require('./db');
const { DB_PATH } = require('./config');

const db = connect(DB_PATH);
seedOrders(db, 10);
console.log('Seeded sample orders.');
