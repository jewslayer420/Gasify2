module.exports = {
  apps: [
    {
      name: 'gasify-backend',
      script: 'src/server.js',
      cwd: 'C:/Users/teoka/OneDrive/Desktop/Gasify2/backend',
      interpreter: 'node',
      env: { NODE_ENV: 'production' },
      restart_delay: 2000,
      max_restarts: 10,
    },
    {
      name: 'gasify-frontend',
      script: 'node_modules/next/dist/bin/next',
      args: 'start',
      cwd: 'C:/Users/teoka/OneDrive/Desktop/Gasify2/frontend',
      interpreter: 'node',
      env: { NODE_ENV: 'production', PORT: 3000 },
      restart_delay: 2000,
      max_restarts: 10,
    },
  ],
};
