const ML_API_BASE = 'http://localhost:5001';

/**
 * Predict clickbait status for array of article titles
 * @param {Array<string>} titles - Array of article titles
 * @returns {Promise<Array<Object>>} Array of clickbait predictions
 */
export async function predictClickbait(titles) {
  if (!Array.isArray(titles) || titles.length === 0) return [];

  try {
    const response = await fetch(`${ML_API_BASE}/predict/clickbait`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ titles }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }

    const data = await response.json();
    if (!data.success || !Array.isArray(data.predictions)) {
      return [];
    }

    return data.predictions;
  } catch (err) {
    console.error('[Clickbait API] Prediction error:', err.message);
    return [];
  }
}
