import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../../lib/api';
import { Modal } from '../ui/Modal';

export type Licencia = {
  id: string;
  codigo: string;
  codigo_sap?: string | null;
  nombre: string;
  horario?: string | null;
  ambito?: string;
  tipo?: string;
  activo: boolean;
  orden: number;
  color_fondo?: string | null;
  color_letra?: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onChanged: (items: Licencia[]) => void;
};

function mensaje(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return 'Error inesperado';
}

export function LicenciasModal({ open, onClose, onChanged }: Props) {
  const [items, setItems] = useState<Licencia[]>([]);
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    api<Licencia[]>('/admin/licencias')
      .then(setItems)
      .catch((e) => setError(mensaje(e)));
  }, [open]);

  async function alta(e: FormEvent) {
    e.preventDefault();
    if (!nombre.trim()) return;
    setBusy(true);
    setError('');
    try {
      const created = await api<Licencia>('/admin/licencias', {
        method: 'POST',
        body: JSON.stringify({ nombre: nombre.trim() }),
      });
      const next = [...items, created].sort((a, b) => a.orden - b.orden);
      setItems(next);
      onChanged(next);
      setNombre('');
    } catch (err) {
      setError(mensaje(err));
    } finally {
      setBusy(false);
    }
  }

  async function toggle(item: Licencia) {
    setBusy(true);
    setError('');
    try {
      const updated = await api<Licencia>(`/admin/licencias/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ activo: !item.activo }),
      });
      const next = items.map((x) => (x.id === item.id ? updated : x));
      setItems(next);
      onChanged(next);
    } catch (err) {
      setError(mensaje(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Códigos"
      description="Catálogo de cuadratura. El alta y la edición viven en Administración → Códigos."
      size="md"
    >
      {error ? <p className="field-error">{error}</p> : null}
      <ul className="lic-admin-list">
        {items.map((item) => (
          <li key={item.id} className={item.activo ? '' : 'is-off'}>
            <div>
              <strong>{item.nombre}</strong>
              <span className="muted">{item.codigo}</span>
            </div>
            <button
              type="button"
              className="btn ghost sm"
              disabled={busy}
              onClick={() => void toggle(item)}
            >
              {item.activo ? 'Desactivar' : 'Activar'}
            </button>
          </li>
        ))}
      </ul>
      <form className="lic-admin-add" onSubmit={alta}>
        <div className="field">
          <label htmlFor="lic-nueva">Nueva licencia</label>
          <input
            id="lic-nueva"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Ej. Licencia por casamiento"
          />
        </div>
        <button type="submit" className="btn primary" disabled={busy || !nombre.trim()}>
          Agregar
        </button>
      </form>
    </Modal>
  );
}
