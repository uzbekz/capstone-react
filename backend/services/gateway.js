import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import cors from 'cors';
import helmet from 'helmet';

const app = express();
app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: false }));

const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5174";
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || FRONTEND_URL)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const LOCAL_DEV_PORTS = ['5173', '5174', '3000', '8080'];
const LOCAL_DEV_ORIGINS = LOCAL_DEV_PORTS.map(port => `http://localhost:${port}`);
const ALL_ALLOWED_ORIGINS = [...new Set([...ALLOWED_ORIGINS, ...LOCAL_DEV_ORIGINS])];

app.use(cors({
  origin(origin, callback) {
    if (!origin || ALL_ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    console.error(`CORS REJECTED! Origin: "${origin}" not in:`, ALL_ALLOWED_ORIGINS);
    return callback(new Error("Origin not allowed by CORS"));
  },
  credentials: true
}));

const proxyOptions = {
    changeOrigin: true,
    xfwd: true, 
};

const authProxy = createProxyMiddleware({ target: 'http://localhost:5001', ...proxyOptions });
const productsProxy = createProxyMiddleware({ target: 'http://localhost:5002', ...proxyOptions });
const ordersProxy = createProxyMiddleware({ target: 'http://localhost:5003', ...proxyOptions });
const usersProxy = createProxyMiddleware({ target: 'http://localhost:5004', ...proxyOptions });

app.use((req, res, next) => {
  console.log(`[GATEWAY] ${new Date().toISOString()} ${req.method} ${req.url}`);
  if (req.path.startsWith('/auth')) {
    console.log(`[GATEWAY] Routing to Auth Service: ${req.path}`);
    return authProxy(req, res, next);
  }
  if (req.path.startsWith('/products')) {
    console.log(`[GATEWAY] Routing to Products Service: ${req.path}`);
    return productsProxy(req, res, next);
  }
  if (req.path.startsWith('/orders') || req.path.startsWith('/reports')) {
    console.log(`[GATEWAY] Routing to Orders Service: ${req.path}`);
    return ordersProxy(req, res, next);
  }
  console.log(`[GATEWAY] Fallback: Routing to Users Service: ${req.path}`);
  return usersProxy(req, res, next); // fallback
});


app.listen(5000, () => {
    console.log('API Gateway listening on port 5000');
});
