import React, { createContext, useContext, useReducer, useEffect, useState, useCallback } from 'react';
import { getFromStorage, setToStorage } from '../utils/helpers';
import { getMe, logout as apiLogout, fetchSaved, saveArticle, unsaveArticle } from '../services/authApi';

const AppContext = createContext(null);

const initialState = {
  // Saves: { uuid: article } — used as local cache regardless of auth
  savedArticles: {},
  reactions: getFromStorage('pulse_reactions') || {},
  activeView: 'feed',
};

function reducer(state, action) {
  switch (action.type) {
    case 'SET_SAVED': {
      // Replace whole saved map (used when loading from backend)
      return { ...state, savedArticles: action.saved };
    }
    case 'OPTIMISTIC_SAVE': {
      const { article } = action;
      const id = article.uuid || article.url;
      const saved = { ...state.savedArticles, [id]: article };
      return { ...state, savedArticles: saved };
    }
    case 'OPTIMISTIC_UNSAVE': {
      const { articleId } = action;
      const saved = { ...state.savedArticles };
      delete saved[articleId];
      return { ...state, savedArticles: saved };
    }
    case 'REACT': {
      const { articleId, reaction } = action;
      const prev = state.reactions[articleId] || { likes: 0, dislikes: 0, userReaction: null };
      let { likes, dislikes } = prev;
      const prevReaction = prev.userReaction;

      if (prevReaction === reaction) {
        if (reaction === 'like') likes = Math.max(0, likes - 1);
        if (reaction === 'dislike') dislikes = Math.max(0, dislikes - 1);
        const reactions = { ...state.reactions, [articleId]: { likes, dislikes, userReaction: null } };
        setToStorage('pulse_reactions', reactions);
        return { ...state, reactions };
      }

      if (prevReaction === 'like') likes = Math.max(0, likes - 1);
      if (prevReaction === 'dislike') dislikes = Math.max(0, dislikes - 1);
      if (reaction === 'like') likes += 1;
      if (reaction === 'dislike') dislikes += 1;

      const reactions = { ...state.reactions, [articleId]: { likes, dislikes, userReaction: reaction } };
      setToStorage('pulse_reactions', reactions);
      return { ...state, reactions };
    }
    case 'SET_VIEW':
      return { ...state, activeView: action.view };
    default:
      return state;
  }
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [user, setUser] = useState(null);         // null = logged out
  const [authLoading, setAuthLoading] = useState(true); // bootstrapping
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);

  // Bootstrap: check if we have a valid token
  useEffect(() => {
    getMe().then(u => {
      setUser(u);
      setAuthLoading(false);
    });
  }, []);

  // When user logs in/out, sync saved articles
  useEffect(() => {
    if (authLoading) return;
    if (user) {
      // Load saved from backend
      fetchSaved()
        .then(articles => {
          const map = {};
          articles.forEach(a => { map[a.uuid || a.url] = a; });
          dispatch({ type: 'SET_SAVED', saved: map });
        })
        .catch(console.error);
    } else {
      // Guest: clear saved (no localStorage persistence for saves)
      dispatch({ type: 'SET_SAVED', saved: {} });
    }
  }, [user, authLoading]);

  const handleLogin = useCallback((u) => {
    setUser(u);
    setShowLoginModal(false);
  }, []);

  const handleLogout = useCallback(() => {
    apiLogout();
    setUser(null);
    dispatch({ type: 'SET_VIEW', view: 'feed' });
  }, []);

  const handleUpdateUser = useCallback((u) => {
    setUser(u);
  }, []);

  const toggleSave = useCallback(async (article) => {
    if (!user) {
      setShowLoginModal(true);
      return;
    }
    const id = article.uuid || article.url;
    const alreadySaved = !!state.savedArticles[id];

    if (alreadySaved) {
      dispatch({ type: 'OPTIMISTIC_UNSAVE', articleId: id });
      try { await unsaveArticle(id); } catch (err) {
        console.error(err);
        dispatch({ type: 'OPTIMISTIC_SAVE', article }); // rollback
      }
    } else {
      dispatch({ type: 'OPTIMISTIC_SAVE', article });
      try { await saveArticle(article); } catch (err) {
        console.error(err);
        dispatch({ type: 'OPTIMISTIC_UNSAVE', articleId: id }); // rollback
      }
    }
  }, [user, state.savedArticles]);

  return (
    <AppContext.Provider value={{
      state,
      dispatch,
      user,
      authLoading,
      showLoginModal,
      setShowLoginModal,
      handleLogin,
      handleLogout,
      showProfileModal,
      setShowProfileModal,
      handleUpdateUser,
      toggleSave,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  return useContext(AppContext);
}
import React, { createContext, useContext, useReducer, useEffect, useState, useCallback } from 'react';
import { getFromStorage, setToStorage } from '../utils/helpers';
import { getMe, logout as apiLogout, fetchSaved, saveArticle, unsaveArticle } from '../services/authApi';

const AppContext = createContext(null);

const initialState = {
  // Saves: { uuid: article } — used as local cache regardless of auth
  savedArticles: {},
  reactions: getFromStorage('pulse_reactions') || {},
  activeView: 'feed',
};

function reducer(state, action) {
  switch (action.type) {
    case 'SET_SAVED': {
      // Replace whole saved map (used when loading from backend)
      return { ...state, savedArticles: action.saved };
    }
    case 'OPTIMISTIC_SAVE': {
      const { article } = action;
      const id = article.uuid || article.url;
      const saved = { ...state.savedArticles, [id]: article };
      return { ...state, savedArticles: saved };
    }
    case 'OPTIMISTIC_UNSAVE': {
      const { articleId } = action;
      const saved = { ...state.savedArticles };
      delete saved[articleId];
      return { ...state, savedArticles: saved };
    }
    case 'REACT': {
      const { articleId, reaction } = action;
      const prev = state.reactions[articleId] || { likes: 0, dislikes: 0, userReaction: null };
      let { likes, dislikes } = prev;
      const prevReaction = prev.userReaction;

      if (prevReaction === reaction) {
        if (reaction === 'like') likes = Math.max(0, likes - 1);
        if (reaction === 'dislike') dislikes = Math.max(0, dislikes - 1);
        const reactions = { ...state.reactions, [articleId]: { likes, dislikes, userReaction: null } };
        setToStorage('pulse_reactions', reactions);
        return { ...state, reactions };
      }

      if (prevReaction === 'like') likes = Math.max(0, likes - 1);
      if (prevReaction === 'dislike') dislikes = Math.max(0, dislikes - 1);
      if (reaction === 'like') likes += 1;
      if (reaction === 'dislike') dislikes += 1;

      const reactions = { ...state.reactions, [articleId]: { likes, dislikes, userReaction: reaction } };
      setToStorage('pulse_reactions', reactions);
      return { ...state, reactions };
    }
    case 'SET_VIEW':
      return { ...state, activeView: action.view };
    default:
      return state;
  }
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [user, setUser] = useState(null);         // null = logged out
  const [authLoading, setAuthLoading] = useState(true); // bootstrapping
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);

  // Bootstrap: check if we have a valid token
  useEffect(() => {
    getMe().then(u => {
      setUser(u);
      setAuthLoading(false);
    });
  }, []);

  // When user logs in/out, sync saved articles
  useEffect(() => {
    if (authLoading) return;
    if (user) {
      // Load saved from backend
      fetchSaved()
        .then(articles => {
          const map = {};
          articles.forEach(a => { map[a.uuid || a.url] = a; });
          dispatch({ type: 'SET_SAVED', saved: map });
        })
        .catch(console.error);
    } else {
      // Guest: clear saved (no localStorage persistence for saves)
      dispatch({ type: 'SET_SAVED', saved: {} });
    }
  }, [user, authLoading]);

  const handleLogin = useCallback((u) => {
    setUser(u);
    setShowLoginModal(false);
  }, []);

  const handleLogout = useCallback(() => {
    apiLogout();
    setUser(null);
    dispatch({ type: 'SET_VIEW', view: 'feed' });
  }, []);

  const handleUpdateUser = useCallback((u) => {
    setUser(u);
  }, []);

  const toggleSave = useCallback(async (article) => {
    if (!user) {
      setShowLoginModal(true);
      return;
    }
    const id = article.uuid || article.url;
    const alreadySaved = !!state.savedArticles[id];

    if (alreadySaved) {
      dispatch({ type: 'OPTIMISTIC_UNSAVE', articleId: id });
      try { await unsaveArticle(id); } catch (err) {
        console.error(err);
        dispatch({ type: 'OPTIMISTIC_SAVE', article }); // rollback
      }
    } else {
      dispatch({ type: 'OPTIMISTIC_SAVE', article });
      try { await saveArticle(article); } catch (err) {
        console.error(err);
        dispatch({ type: 'OPTIMISTIC_UNSAVE', articleId: id }); // rollback
      }
    }
  }, [user, state.savedArticles]);

  return (
    <AppContext.Provider value={{
      state,
      dispatch,
      user,
      authLoading,
      showLoginModal,
      setShowLoginModal,
      handleLogin,
      handleLogout,
      showProfileModal,
      setShowProfileModal,
      handleUpdateUser,
      toggleSave,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  return useContext(AppContext);
}
