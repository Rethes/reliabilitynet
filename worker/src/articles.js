import { Hono } from 'hono';
import { readJsonBody } from './http.js';
import { requireAuth } from './security.js';

const articles = new Hono();

function logSaveFailure(error) {
  console.error('Saved article operation failed:', error instanceof Error ? error.name : 'UnknownError');
}

articles.get('/saves', requireAuth, async c => {
  const { results } = await c.env.DB.prepare(
    'SELECT article_json FROM saved_articles WHERE user_id = ? ORDER BY saved_at DESC',
  )
    .bind(c.get('user').id)
    .all();
  return c.json({ articles: results.map(row => JSON.parse(row.article_json)) });
});

articles.post('/saves', requireAuth, async c => {
  const parsed = await readJsonBody(c);
  if (parsed.response) return parsed.response;
  const { article } = parsed.value || {};
  if (!article) return c.json({ error: 'Article is required' }, 400);

  const articleId = article.uuid || article.url;
  if (!articleId) return c.json({ error: 'Article must have uuid or url' }, 400);

  try {
    await c.env.DB.prepare(
      'INSERT OR IGNORE INTO saved_articles (user_id, article_id, article_json) VALUES (?, ?, ?)',
    )
      .bind(c.get('user').id, String(articleId), JSON.stringify(article))
      .run();
    return c.json({ saved: true, articleId });
  } catch (error) {
    logSaveFailure(error);
    return c.json({ error: 'Failed to save article' }, 500);
  }
});

articles.delete('/saves/:articleId', requireAuth, async c => {
  const articleId = c.req.param('articleId');
  await c.env.DB.prepare('DELETE FROM saved_articles WHERE user_id = ? AND article_id = ?')
    .bind(c.get('user').id, articleId)
    .run();
  return c.json({ saved: false, articleId });
});

export default articles;
