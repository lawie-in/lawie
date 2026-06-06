const ENV_FILE = '/home/ubuntu/lawie/.env.production';
const NODE_ARGS = `--require dotenv/config`;
const DOTENV_ENV = { DOTENV_CONFIG_PATH: ENV_FILE };

module.exports = {
  apps: [
    {
      name: 'lawie-gateway',
      script: 'dist/index.js',
      cwd: '/home/ubuntu/lawie/apps/gateway',
      node_args: NODE_ARGS,
      env: DOTENV_ENV,
      instances: 1,
      autorestart: true,
      watch: false,
    },
    {
      name: 'lawie-auth',
      script: 'dist/index.js',
      cwd: '/home/ubuntu/lawie/apps/auth',
      node_args: NODE_ARGS,
      env: DOTENV_ENV,
      instances: 1,
      autorestart: true,
      watch: false,
    },
    {
      name: 'lawie-drafting',
      script: 'dist/index.js',
      cwd: '/home/ubuntu/lawie/apps/drafting',
      node_args: NODE_ARGS,
      env: DOTENV_ENV,
      instances: 1,
      autorestart: true,
      watch: false,
    },
    {
      name: 'lawie-billing',
      script: 'dist/index.js',
      cwd: '/home/ubuntu/lawie/apps/billing',
      node_args: NODE_ARGS,
      env: DOTENV_ENV,
      instances: 1,
      autorestart: true,
      watch: false,
    },
    {
      name: 'lawie-email-worker',
      script: 'dist/index.js',
      cwd: '/home/ubuntu/lawie/apps/email-worker',
      node_args: NODE_ARGS,
      env: DOTENV_ENV,
      instances: 1,
      autorestart: true,
      watch: false,
    },
    {
      name: 'lawie-web',
      script: '/home/ubuntu/lawie/apps/web/.next/standalone/apps/web/server.js',
      cwd: '/home/ubuntu/lawie/apps/web',
      node_args: NODE_ARGS,
      env: { ...DOTENV_ENV, PORT: '3000' },
      instances: 1,
      autorestart: true,
      watch: false,
    },
  ],
};
