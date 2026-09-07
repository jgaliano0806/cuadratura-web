import type { ReactNode } from 'react';
import { FilterPicker } from './ui';
import {
  AMBITOS,
  plantelesDe,
  type AmbitoId,
  type PlantelId,
} from '../lib/plantel';

type Props = {
  ambito: AmbitoId;
  planteles: PlantelId[];
  onAmbito: (id: AmbitoId) => void;
  onPlanteles: (ids: PlantelId[]) => void;
  children?: ReactNode;
};

export function PlantelSwitch({
  ambito,
  planteles,
  onAmbito,
  onPlanteles,
  children,
}: Props) {
  const cuadraturas = plantelesDe(ambito);

  return (
    <div className="cuad-head-nav">
      <div className="plantel-switch" role="tablist" aria-label="Ámbito">
        {AMBITOS.map((a) => (
          <button
            key={a.id}
            type="button"
            role="tab"
            aria-selected={ambito === a.id}
            className={ambito === a.id ? 'active' : undefined}
            onClick={() => onAmbito(a.id)}
          >
            {a.label}
          </button>
        ))}
      </div>
      <FilterPicker
        id="cuad-plantel"
        className="cuad-plantel-picker"
        aria-label="Cuadratura"
        summaryLabel="Cuadratura…"
        placeholder="Buscar cuadratura…"
        allLabel="Cuadraturas"
        allowEmpty={false}
        options={cuadraturas.map((p) => ({
          id: p.id,
          label: p.title,
          search: `${p.label} ${p.title}`,
        }))}
        values={planteles}
        onChange={(ids) => onPlanteles(ids as PlantelId[])}
      />
      {children}
    </div>
  );
}
