import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../../lib/api';
import { Modal } from '../ui/Modal';
import type { Person } from '../ui/PeoplePicker';

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: (person: Person) => void;
};

function mensaje(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return 'Error inesperado';
}

export function PeajistaModal({ open, onClose, onCreated }: Props) {
  const [nombres, setNombres] = useState('');
  const [apellido, setApellido] = useState('');
  const [legajo, setLegajo] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function alta(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const created = await api<Person>('/admin/inspectors', {
        method: 'POST',
        body: JSON.stringify({
          nombres: nombres.trim(),
          apellido: apellido.trim(),
          legajo: legajo.trim(),
          tipo_plantel: 'PEAJISTA',
        }),
      });
      onCreated(created);
      setNombres('');
      setApellido('');
      setLegajo('');
      onClose();
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
      title="Incorporar peajista"
      description="Se da de alta con nombre, apellido y legajo. Queda disponible para buscarlo y registrar situaciones."
      size="sm"
      footer={
        <>
          <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          <button
            type="submit"
            form="peajista-alta"
            className="btn primary"
            disabled={busy || !nombres.trim() || !apellido.trim() || !legajo.trim()}
          >
            Incorporar
          </button>
        </>
      }
    >
      <form id="peajista-alta" className="stack" onSubmit={alta}>
        {error ? <p className="field-error">{error}</p> : null}
        <div className="field">
          <label htmlFor="pj-apellido">Apellido</label>
          <input
            id="pj-apellido"
            value={apellido}
            onChange={(e) => setApellido(e.target.value)}
            autoComplete="family-name"
            required
          />
        </div>
        <div className="field">
          <label htmlFor="pj-nombres">Nombre</label>
          <input
            id="pj-nombres"
            value={nombres}
            onChange={(e) => setNombres(e.target.value)}
            autoComplete="given-name"
            required
          />
        </div>
        <div className="field">
          <label htmlFor="pj-legajo">Legajo</label>
          <input
            id="pj-legajo"
            value={legajo}
            onChange={(e) => setLegajo(e.target.value)}
            autoComplete="off"
            required
          />
        </div>
      </form>
    </Modal>
  );
}
