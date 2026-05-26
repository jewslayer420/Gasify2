// Render entry point — delegates to backend/src/server.js
const path = require('path');
process.chdir(path.join(__dirname, 'backend'));
require(path.join(__dirname, 'backend', 'src', 'server'));
