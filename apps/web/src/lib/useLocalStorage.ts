import { useCallback, useEffect, useState } from 'react';

/**
 * Persiste un estado en localStorage bajo `key`. Sincroniza entre pestañas
 * del mismo origen mediante el evento `storage`. Devuelve `[value, set, reset]`.
 */
export function useLocalStorage<T>(key: string, initial: T) {
  const readInitial = useCallback((): T => {
    if (typeof window === 'undefined') return initial;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw == null) return initial;
      return JSON.parse(raw) as T;
    } catch {
      return initial;
    }
  }, [key, initial]);

  const [value, setValue] = useState<T>(readInitial);

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* quota excedida u origen sin storage: ignorar silenciosamente */
    }
  }, [key, value]);

  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== key || e.newValue == null) return;
      try {
        setValue(JSON.parse(e.newValue) as T);
      } catch {
        /* ignorar cambios inválidos */
      }
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [key]);

  const reset = useCallback(() => setValue(initial), [initial]);
  return [value, setValue, reset] as const;
}
