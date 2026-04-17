import { createServiceApp } from './shared.js';
import authRoutes from '../routes/auth.js';

const app = createServiceApp();

// Mount the router under /auth because the gateway preserves the base path
app.use('/auth', authRoutes);

const PORT = 5001;
app.listen(PORT, () => {
    console.log(`Auth Service listening on port ${PORT}`);
});
