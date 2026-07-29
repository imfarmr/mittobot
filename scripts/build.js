const { execSync } = require('child_process');

execSync('cd dashboard-v2 && npm install && npm run build && cd .. && node index.js', {
  stdio: 'inherit',
});
