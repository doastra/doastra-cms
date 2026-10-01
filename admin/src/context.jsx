import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, getToken, setToken, siteApi } from './api.js';

// ---------- Auth ----------
const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    if (!getToken()) { setUser(null); setReady(true); return; }
    try {
      const { user } = await api.get('/auth/me');
      setUser(user);
    } catch {
      setUser(null);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const login = async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    setToken(res.token);
    setUser(res.user);
    return res.user;
  };
  const logout = () => { setToken(null); setUser(null); window.location.href = '/admin/login'; };

  return <AuthCtx.Provider value={{ user, ready, login, logout, refresh }}>{children}</AuthCtx.Provider>;
}
export const useAuth = () => useContext(AuthCtx);

// ---------- Current site (structure is loaded once and shared by all screens) ----------
const SiteCtx = createContext(null);

export function SiteProvider({ siteId, children }) {
  const [site, setSite] = useState(null);
  const [contentTypes, setContentTypes] = useState([]);
  const [sectionTypes, setSectionTypes] = useState([]);
  const [taxonomies, setTaxonomies] = useState([]);
  const [error, setError] = useState(null);
  const s = siteApi(siteId);

  const reload = useCallback(async () => {
    try {
      const sx = siteApi(siteId);
      const [st, ct, sec, tax] = await Promise.all([sx.get(''), sx.get('/content-types'), sx.get('/section-types'), sx.get('/taxonomies')]);
      setSite(st); setContentTypes(ct); setSectionTypes(sec); setTaxonomies(tax);
      setError(null);
      localStorage.setItem('dcms_site', String(siteId));
    } catch (e) {
      setError(e);
    }
  }, [siteId]);

  useEffect(() => { setSite(null); reload(); }, [reload]);

  /** Section types usable on pages: site-specific overrides shared with the same key */
  const usableSections = (() => {
    const map = new Map();
    for (const t of sectionTypes) if (!map.has(t.key) || !t.shared) map.set(t.key, t);
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  })();

  const role = site?.role;
  const can = {
    structure: role === 'admin',
    editPages: role === 'admin' || role === 'editor',
    deleteMedia: role === 'admin' || role === 'editor',
  };

  return (
    <SiteCtx.Provider value={{ siteId: Number(siteId), site, api: s, contentTypes, sectionTypes, usableSections, taxonomies, reload, error, role, can }}>
      {children}
    </SiteCtx.Provider>
  );
}
export const useSite = () => useContext(SiteCtx);
