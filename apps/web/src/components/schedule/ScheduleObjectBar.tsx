import type { ReactNode } from 'react';

export type ScheduleTab = 'plan' | 'coverage';
export type ScheduleMode = 'sap' | 'classic';

type VersionOpt = {
  id: string;
  label: string;
};

type Props = {
  monthLabel: string;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onThisMonth: () => void;
  versionId: string;
  versions: VersionOpt[];
  onVersionChange: (id: string) => void;
  tab: ScheduleTab;
  onTabChange: (t: ScheduleTab) => void;
  mode: ScheduleMode;
  onModeChange: (m: ScheduleMode) => void;
  busy?: boolean;
  onRefresh?: () => void;
  actions?: ReactNode;
  primaryTabLabel?: string;
};

export function ScheduleObjectBar({
  monthLabel,
  onPrevMonth,
  onNextMonth,
  onThisMonth,
  versionId,
  versions,
  onVersionChange,
  tab,
  onTabChange,
  mode,
  onModeChange,
  busy,
  onRefresh,
  actions,
  primaryTabLabel = 'Planificación',
}: Props) {
  return (
    <div className="sap-object-bar no-print">
      <div className="sap-object-left">
        <div className="sap-month-nav" role="group" aria-label="Período">
          <button
            type="button"
            className="btn secondary sm"
            onClick={onPrevMonth}
            aria-label="Mes anterior"
          >
            ‹
          </button>
          <strong className="sap-month-label">{monthLabel}</strong>
          <button
            type="button"
            className="btn secondary sm"
            onClick={onNextMonth}
            aria-label="Mes siguiente"
          >
            ›
          </button>
          <button type="button" className="btn ghost sm" onClick={onThisMonth}>
            Este mes
          </button>
        </div>

        <div className="sap-tabs" role="tablist" aria-label="Vista de datos">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'plan'}
            className={`sap-tab${tab === 'plan' ? ' active' : ''}`}
            onClick={() => onTabChange('plan')}
          >
            {primaryTabLabel}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'coverage'}
            className={`sap-tab${tab === 'coverage' ? ' active' : ''}`}
            onClick={() => onTabChange('coverage')}
          >
            Cobertura
          </button>
        </div>
      </div>

      <div className="sap-object-right">
        <div className="field" style={{ minWidth: 220, margin: 0 }}>
          <label htmlFor="sap-version">Versión</label>
          <select
            id="sap-version"
            value={versionId}
            onChange={(e) => onVersionChange(e.target.value)}
          >
            {versions.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        </div>

        <div className="sap-mode" role="group" aria-label="Modo de vista">
          <button
            type="button"
            className={`chip${mode === 'sap' ? ' chip-active' : ''}`}
            onClick={() => onModeChange('sap')}
          >
            Vista SAP
          </button>
          <button
            type="button"
            className={`chip${mode === 'classic' ? ' chip-active' : ''}`}
            onClick={() => onModeChange('classic')}
          >
            Clásica
          </button>
        </div>

        {onRefresh ? (
          <button
            type="button"
            className="btn secondary sm"
            disabled={busy}
            onClick={onRefresh}
          >
            {busy ? 'Cargando…' : 'Actualizar'}
          </button>
        ) : null}
        {actions}
      </div>
    </div>
  );
}
