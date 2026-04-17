module.exports = {
  apps: [
    {
      name: 'api-gateway',
      script: './services/gateway.js',
      env: {
        NODE_ENV: 'production',
        PORT: 5000,
        SQL_SYNC_ALTER: 'false'
      }
    },
    {
      name: 'auth-service',
      script: './services/auth.service.js',
      env: {
        NODE_ENV: 'production',
        PORT: 5001,
        SQL_SYNC_ALTER: 'false'
      }
    },
    {
      name: 'product-service',
      script: './services/product.service.js',
      env: {
        NODE_ENV: 'production',
        PORT: 5002,
        SQL_SYNC_ALTER: 'false'
      }
    },
    {
      name: 'order-service',
      script: './services/order.service.js',
      env: {
        NODE_ENV: 'production',
        PORT: 5003,
        SQL_SYNC_ALTER: 'false'
      }
    },
    {
      name: 'user-service',
      script: './services/user.service.js',
      env: {
        NODE_ENV: 'production',
        PORT: 5004,
        SQL_SYNC_ALTER: 'false'
      }
    },
    {
      name: 'frontend',
      script: 'npx',
      args: 'serve -s dist -l 3000',
      cwd: '../frontend',
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
