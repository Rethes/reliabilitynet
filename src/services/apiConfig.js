const configuredApiOrigin = (import.meta.env.VITE_API_BASE || '').trim().replace(/\/+$/, '');

// VITE_ML_BASE lets you point the ML model server at any URL independently of
// the Cloudflare Worker API — e.g. a Kaggle+Gradio public tunnel URL.
// Priority: VITE_ML_BASE > VITE_API_BASE Worker relay > localhost fallback
const configuredMlOrigin = (import.meta.env.VITE_ML_BASE || '').trim().replace(/\/+$/, '');

export const isWorkerAPI = Boolean(configuredApiOrigin);
export const workerApiBase = isWorkerAPI ? `${configuredApiOrigin}/api` : '';
export const authApiBase = isWorkerAPI ? workerApiBase : 'http://localhost:4000';
export const newsApiBase = isWorkerAPI
  ? `${workerApiBase}/news`
  : 'http://localhost:3131/api/news';
export const newsApiOrigin = isWorkerAPI ? configuredApiOrigin : 'http://localhost:3131';
export const newsHealthUrl = isWorkerAPI
  ? `${workerApiBase}/health`
  : 'http://localhost:3131/ping';

// ML base: explicit override → Worker relay → local Flask fallback
export const mlApiBase = configuredMlOrigin
  ? configuredMlOrigin
  : isWorkerAPI
    ? `${workerApiBase}/ml`
    : 'http://localhost:5001';
