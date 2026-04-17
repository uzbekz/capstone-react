module.exports = {
  apps: [
    {
      name: 'api-gateway',
      script: './services/gateway.js',
      env: {
        NODE_ENV: 'production',
        PORT: 5000
      }
    },
    {
      name: 'auth-service',
      script: './services/auth.service.js',
      env: {
        NODE_ENV: 'production',
        PORT: 5001
      }
    },
    {
      name: 'product-service',
      script: './services/product.service.js',
      env: {
        NODE_ENV: 'production',
        PORT: 5002
      }
    },
    {
      name: 'order-service',
      script: './services/order.service.js',
      env: {
        NODE_ENV: 'production',
        PORT: 5003
      }
    },
    {
      name: 'user-service',
      script: './services/user.service.js',
      env: {
        NODE_ENV: 'production',
        PORT: 5004
      }
    }
  ]
};
