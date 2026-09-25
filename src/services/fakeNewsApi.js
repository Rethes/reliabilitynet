const ML_API_BASE = 'http://localhost:5001';

/**
 * Predict fake news status for an array of article titles
 * @param {Array<string>} titles - Array of article titles
 * @returns {Promise<Array<Object>>} Array of fake news predictions
 */
export async function predictFakeNews(titles) {
  if (!Array.isArray(titles) || titles.length === 0) return [];

  try {
    const response = await fetch(`${ML_API_BASE}/predict/fake-news`, {
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
    console.error('[Fake News API] Prediction error:', err.message);
    return [];
  }
}
