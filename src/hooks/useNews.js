import { useState, useCallback, useRef } from 'react';
import { fetchNews, checkProxy } from '../services/newsApi';
import { getSourceName, getPublished } from '../utils/helpers';


const API_KEY = import.meta.env.VITE_API_KEY;
const PAGE_SIZE = 12;

export function hasPrimaryCategory(article, category) {
  if (!category) return true;
  const categories = Array.isArray(article.categories) ? article.categories : [];
  const primaryCategory = categories[0];
  const normalizeCategory = value => String(value).trim().toLowerCase() === 'sport'
    ? 'sports'
    : String(value).trim().toLowerCase();
  return typeof primaryCategory === 'string'
    && normalizeCategory(primaryCategory) === normalizeCategory(category);
}

function getArticleKey(article) {
  if (article?.uuid) return `uuid:${article.uuid}`;
  if (article?.url) return `url:${article.url}`;

  return [
    article?.title,
    getSourceName(article),
    getPublished(article),
  ].map(value => String(value || '').trim().toLowerCase()).join('|');
}

function getDateBoundary(dateValue, dayOffset = 0) {
  const [year, month, day] = dateValue.split('-').map(Number);
  return new Date(year, month - 1, day + dayOffset).getTime();
}

export function filterArticles(articles, filters, selectedSources = new Set()) {
  const f = filters || {};
  const uniqueArticles = new Map();
  articles.forEach(article => {
    const key = getArticleKey(article);
    if (!uniqueArticles.has(key)) uniqueArticles.set(key, article);
  });
  let result = [...uniqueArticles.values()];

  if (f.category) {
    result = result.filter(article => hasPrimaryCategory(article, f.category));
  }

  if (f.language) {
    result = result.filter(article => (article.language || '').toLowerCase() === f.language.toLowerCase());
  }

  if (f.dateFrom) {
    const fromMs = getDateBoundary(f.dateFrom);
    result = result.filter(article => new Date(getPublished(article)).getTime() >= fromMs);
  }

  if (f.dateTo) {
    const toMs = getDateBoundary(f.dateTo, 1);
    result = result.filter(article => new Date(getPublished(article)).getTime() < toMs);
  }

  if (selectedSources.size > 0) {
    result = result.filter(article => selectedSources.has(getSourceName(article)));
  }

  if (f.sort === 'oldest') {
    result.sort((a, b) => new Date(getPublished(a)) - new Date(getPublished(b)));
  } else if (f.sort === 'source') {
    result.sort((a, b) => getSourceName(a).localeCompare(getSourceName(b)));
  } else {
    result.sort((a, b) => new Date(getPublished(b)) - new Date(getPublished(a)));
  }

  return result;
}

export function useNews() {
  const [allArticles, setAllArticles] = useState([]);
  const [filteredArticles, setFilteredArticles] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null); // null | 'proxy' | 'api_key' | 'auth' | 'generic'
  const [progress, setProgress] = useState(null); // null | { text, pct }
  const [selectedSources, setSelectedSources] = useState(new Set());
  const loadRequestRef = useRef(0);

  const filtersRef = useRef({
    search: '', category: '', language: '', sort: '', dateFrom: '', dateTo: '',
  });

  const applyFilters = useCallback((articles, srcs, overrideFilters) => {
    const f = overrideFilters || filtersRef.current;
    const result = filterArticles(articles, f, srcs);

    setFilteredArticles(result);
    setCurrentPage(1);
  }, []);

  const loadNews = useCallback(async (filters) => {
    const requestId = ++loadRequestRef.current;
    if (!API_KEY) {
      if (requestId === loadRequestRef.current) setError('api_key');
      return;
    }

    const alive = await checkProxy();
    if (requestId !== loadRequestRef.current) return;
    if (!alive) { setError('proxy'); return; }

    setIsLoading(true);
    setError(null);
    setAllArticles([]);
    setFilteredArticles([]);
    filtersRef.current = filters;

    try {
      const articles = await fetchNews(API_KEY, filters, (prog) => {
        if (requestId !== loadRequestRef.current) return;
        setProgress(prog);
      });

      if (requestId !== loadRequestRef.current) return;

      setAllArticles(articles);
      applyFilters(articles, new Set(), filters);
    } catch (err) {
      if (requestId !== loadRequestRef.current) return;
      const code = err.message.includes('401') || err.message.includes('403') ? 'auth' : 'generic';
      setError(code);
    } finally {
      if (requestId === loadRequestRef.current) {
        setIsLoading(false);
        setProgress(null);
      }
    }
  }, [applyFilters]);

  const updateFilters = useCallback((newFilters, articles, srcs) => {
    filtersRef.current = newFilters;
    applyFilters(articles, srcs, newFilters);
  }, [applyFilters]);

  const toggleSource = useCallback((name, checked, articles) => {
    setSelectedSources(prev => {
      const next = new Set(prev);
      if (checked) next.add(name);
      else next.delete(name);
      applyFilters(articles, next);
      return next;
    });
  }, [applyFilters]);

  const clearSources = useCallback((articles) => {
    setSelectedSources(new Set());
    applyFilters(articles, new Set());
  }, [applyFilters]);

  const totalPages = Math.ceil(filteredArticles.length / PAGE_SIZE);
  const pageArticles = filteredArticles.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return {
    allArticles,
    filteredArticles,
    pageArticles,
    currentPage,
    totalPages,
    isLoading,
    error,
    progress,
    selectedSources,
    filters: filtersRef.current,
    loadNews,
    updateFilters,
    toggleSource,
    clearSources,
    setCurrentPage,
  };
}
