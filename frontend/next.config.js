const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pin the workspace root to this frontend dir so Next/Turbopack doesn't infer it
  // from an unrelated lockfile elsewhere on the machine (e.g. C:\Users\teoka).
  turbopack: {
    root: __dirname,
  },
};

module.exports = nextConfig;
