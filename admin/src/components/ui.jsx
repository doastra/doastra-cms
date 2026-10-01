import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { errorText } from '../api.js';

// ---------- Toasts ----------
const ToastCtx = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((text, type = 'info') => {
    const id = Math.random();
    setToasts((t) => [...t, { id, text, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), type === 'error' ? 6000 : 3000);
  }, []);
  const api = {
    success: (t) => push(t, 'success'),
    error: (e) => push(typeof e === 'string' ? e : errorText(e), 'error'),
    info: (t) => push(t, 'info'),
  };
  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="toasts">
        {toasts.map((t) => <div key={t.id} className={`toast ${t.type}`}>{t.text}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

// ---------- Modal ----------
export function Modal({ title, onClose, children, footer, wide }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`modal ${wide ? 'wide' : ''}`}>
        <div className="modal-head">
          <h2 className="grow">{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

// ---------- Confirm dialog (promise-based) ----------
const ConfirmCtx = createContext(null);
export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);
  const confirm = (message, { title = 'Are you sure?', okText = 'Yes, continue', danger = true } = {}) =>
    new Promise((resolve) => setState({ message, title, okText, danger, resolve }));
  const close = (v) => { state?.resolve(v); setState(null); };
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {state && (
        <Modal title={state.title} onClose={() => close(false)}
          footer={<>
            <button className="btn" onClick={() => close(false)}>Cancel</button>
            <button className={`btn ${state.danger ? 'danger' : 'primary'}`} onClick={() => close(true)} autoFocus>{state.okText}</button>
          </>}>
          <p style={{ margin: 0, whiteSpace: 'pre-line' }}>{state.message}</p>
        </Modal>
      )}
    </ConfirmCtx.Provider>
  );
}
export const useConfirm = () => useContext(ConfirmCtx);

// ---------- Misc ----------
export const Spinner = () => <div className="spinner" />;

export function Empty({ icon = '📭', title, children }) {
  return (
    <div className="empty">
      <div className="big">{icon}</div>
      <h3 style={{ margin: '8px 0 4px', color: 'var(--text)' }}>{title}</h3>
      <div>{children}</div>
    </div>
  );
}

export function StatusBadge({ status }) {
  return <span className={`badge ${status}`}>{status === 'published' ? 'Published' : 'Draft'}</span>;
}

export function Field({ label, required, help, children, className = '' }) {
  return (
    <div className={`field ${className}`}>
      {label && <label>{label}{required && <span className="req">*</span>}</label>}
      {children}
      {help && <div className="help">{help}</div>}
    </div>
  );
}

export function timeAgo(d) {
  if (!d) return '';
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} d ago`;
  return new Date(d).toLocaleDateString();
}

/** Simple data loader hook: const { data, loading, error, reload, setData } = useLoad(fn, deps) */
export function useLoad(fn, deps = []) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const load = useCallback(() => {
    setState((s) => ({ ...s, loading: true }));
    return fn()
      .then((data) => setState({ data, loading: false, error: null }))
      .catch((error) => setState({ data: null, loading: false, error }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { load(); }, [load]);
  return { ...state, reload: load, setData: (data) => setState((s) => ({ ...s, data: typeof data === 'function' ? data(s.data) : data })) };
}

/** Warn before leaving a page with unsaved changes. */
export function useUnsavedWarning(dirty) {
  useEffect(() => {
    if (!dirty) return;
    const h = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);
}

/** Reorder helper for drag & drop / up-down buttons */
export function move(list, from, to) {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
