const configuredApiOrigin = (import.meta.env.VITE_API_BASE || '').trim().replace(/\/+$/, '');

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
export const mlApiBase = isWorkerAPI
  ? `${workerApiBase}/ml`
  : 'http://localhost:5001';
