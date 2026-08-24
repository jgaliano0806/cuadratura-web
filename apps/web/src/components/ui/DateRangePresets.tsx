import { useMemo } from 'react';
import { buildPresets, matchPreset, type Preset } from '../../lib/datePresets';

type Props = {
  from: string;
  to: string;
  onApply: (from: string, to: string) => void;
  /** Filtrado opcional de presets por id. */
  include?: Array<Preset['id']>;
  reference?: Date;
};

export function DateRangePresets({ from, to, onApply, include, reference }: Props) {
  const presets = useMemo(() => {
    const all = buildPresets(reference);
    if (!include) return all;
    const set = new Set(include);
    return all.filter((p) => set.has(p.id));
  }, [include, reference]);

  const active = useMemo(() => matchPreset(from, to, presets), [from, to, presets]);

  return (
    <div className="date-presets" role="group" aria-label="Rangos rápidos">
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
          {p.label}
        </button>
      ))}
    </div>
  );
}
