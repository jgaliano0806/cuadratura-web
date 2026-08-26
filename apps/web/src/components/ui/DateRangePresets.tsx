import { useMemo } from 'react';
import { buildPresets, matchPreset, type Preset } from '../../lib/datePresets';

const SHORT: Partial<Record<Preset['id'], string>> = {
  'this-week': 'Semana',
  'this-month': 'Mes',
  'next-month': 'Próx.',
};

type Props = {
  from: string;
  to: string;
  onApply: (from: string, to: string) => void;
  /** Filtrado opcional de presets por id. */
  include?: Array<Preset['id']>;
  reference?: Date;
  compact?: boolean;
};

export function DateRangePresets({
  from,
  to,
  onApply,
  include,
  reference,
  compact,
}: Props) {
  const presets = useMemo(() => {
    const all = buildPresets(reference);
    if (!include) return all;
    const set = new Set(include);
    return all.filter((p) => set.has(p.id));
  }, [include, reference]);

  const active = useMemo(() => matchPreset(from, to, presets), [from, to, presets]);

  return (
    <div
      className={`date-presets${compact ? ' is-compact' : ''}`}
      role="group"
      aria-label="Rangos rápidos"
    >
      {presets.map((p) => (
        <button
          key={p.id}
          type="button"
          className={`chip${active === p.id ? ' chip-active' : ''}`}
          onClick={() => {
            const r = p.range();
            onApply(r.from, r.to);
          }}
        >
          {compact ? (SHORT[p.id] ?? p.label) : p.label}
        </button>
      ))}
    </div>
  );
}
