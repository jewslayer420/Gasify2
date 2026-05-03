require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { syncStations } = require('../services/sync');

syncStations()
  .then(() => { console.log('Seed complete'); process.exit(0); })
  .catch(err => { console.error(err); process.exit(1); });
