import { useEffect, useState } from 'react';
import { useBoxTheme, type ColorBox } from '../lib/boxTheme';
import { useCuadPaneles } from '../lib/cuadPaneles';
import { THEME_DEFAULTS, useTheme, type ThemePreference } from '../lib/theme';

const PRESETS = [
  { id: 'dark', label: 'Nocturno', bg: '#0B0F1A', text: '#E7EBF3', sidebarBg: '#060915', sidebarText: '#E7EBF3' },
  { id: 'slate', label: 'Pizarra', bg: '#1A1F2A', text: '#F2F4F8', sidebarBg: '#12151C', sidebarText: '#F2F4F8' },
  { id: 'forest', label: 'Bosque', bg: '#121A14', text: '#E6F0E4', sidebarBg: '#0C1610', sidebarText: '#E6F0E4' },
  { id: 'light', label: 'Claro', bg: '#F5F7F4', text: '#0F1420', sidebarBg: '#14261C', sidebarText: '#F7F3EA' },
  { id: 'paper', label: 'Papel', bg: '#F4EFE4', text: '#1A140C', sidebarBg: '#2A2118', sidebarText: '#F4EFE4' },
] as const;

type ColorKind = 'bg' | 'text' | 'sidebarBg' | 'sidebarText';

const PREF_OPTS: Array<{ id: ThemePreference; label: string }> = [
  { id: 'dark', label: 'Nocturno' },
  { id: 'light', label: 'Claro' },
  { id: 'system', label: 'Sistema' },
];

function BoxRow({
  box,
  index,
  total,
  onPatch,
  onMove,
}: {
  box: ColorBox;
  index: number;
  total: number;
  onPatch: (id: string, patch: Partial<ColorBox>) => void;
  onMove: (id: string, dir: -1 | 1) => void;
}) {
  return (
    <li className={`appearance-box-row${box.visible ? '' : ' is-off'}`}>
      <label className="appearance-box-vis">
        <input
          type="checkbox"
          checked={box.visible}
          onChange={() => onPatch(box.id, { visible: !box.visible })}
          aria-label={`Mostrar ${box.label}`}
        />
      </label>
      <span className="appearance-box-name">{box.label}</span>
      <input
        type="color"
        value={box.bg}
        aria-label={`Fondo ${box.label}`}
        onChange={(e) => onPatch(box.id, { bg: e.target.value.toUpperCase() })}
      />
      <input
        type="color"
        value={box.fg}
        aria-label={`Letras ${box.label}`}
        onChange={(e) => onPatch(box.id, { fg: e.target.value.toUpperCase() })}
      />
      <span className="appearance-box-preview" style={{ background: box.bg, color: box.fg }}>
        Aa
      </span>
      <span className="appearance-box-move">
        <button type="button" disabled={index === 0} onClick={() => onMove(box.id, -1)} aria-label="Subir">
          ↑
        </button>
        <button
          type="button"
          disabled={index === total - 1}
          onClick={() => onMove(box.id, 1)}
          aria-label="Bajar"
        >
          ↓
        </button>
      </span>
    </li>
  );
}

function ColorSwatch({
  kind,
  label,
  value,
  draft,
  onCommit,
}: {
  kind: ColorKind;
  label: string;
  value: string;
  draft: string;
  onCommit: (kind: ColorKind, raw: string) => void;
}) {
  return (
    <label className="appearance-swatch">
      <span>{label}</span>
      <input
        type="color"
        value={value}
        onChange={(e) => onCommit(kind, e.target.value)}
        aria-label={label}
      />
      <input
        type="text"
        className="appearance-hex"
        value={draft}
        onChange={(e) => onCommit(kind, e.target.value)}
        spellCheck={false}
      />
    </label>
  );
}

export function AppearancePanel() {
  const { preference, theme, setPreference, colors, setColors, resetColors } = useTheme();
  const { boxes, ocupacion, topbar, patchBox, moveBox, toggleTopbar, resetBoxes } = useBoxTheme();
  const { paneles, toggle: togglePanel, move: movePanel, reset: resetPaneles } = useCuadPaneles();
  const base = THEME_DEFAULTS[theme];
  const custom =
    colors.bg !== base.bg ||
    colors.text !== base.text ||
    colors.sidebarBg !== base.sidebarBg ||
    colors.sidebarText !== base.sidebarText;
  const [draft, setDraft] = useState({
    bg: colors.bg,
    text: colors.text,
    sidebarBg: colors.sidebarBg,
    sidebarText: colors.sidebarText,
  });

  useEffect(() => {
    setDraft({
      bg: colors.bg,
      text: colors.text,
      sidebarBg: colors.sidebarBg,
      sidebarText: colors.sidebarText,
    });
  }, [colors.bg, colors.text, colors.sidebarBg, colors.sidebarText]);

  function commit(kind: ColorKind, raw: string) {
    const hex = raw.trim().toUpperCase();
    setDraft((prev) => ({ ...prev, [kind]: hex }));
    if (/^#[0-9A-F]{6}$/.test(hex)) setColors({ [kind]: hex });
  }

  return (
    <div className="appearance-panel">
      <div className="field">
        <span className="field-label">Tema</span>
        <div className="appearance-seg">
          {PREF_OPTS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={preference === opt.id ? 'is-on' : undefined}
              onClick={() => setPreference(opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="appearance-colors">
        <ColorSwatch kind="bg" label="Fondo" value={colors.bg} draft={draft.bg} onCommit={commit} />
        <ColorSwatch kind="text" label="Letras" value={colors.text} draft={draft.text} onCommit={commit} />
      </div>

      <p className="appearance-preview" style={{ background: colors.bg, color: colors.text }}>
        Fondo y letras de la app en {theme === 'dark' ? 'nocturno' : 'claro'}.
      </p>

      <h3 className="appearance-h">Menú lateral</h3>
      <p className="muted">Fondo y letras del menú, el nombre, el rol y Cerrar sesión.</p>
      <div className="appearance-colors">
        <ColorSwatch
          kind="sidebarBg"
          label="Fondo"
          value={colors.sidebarBg}
          draft={draft.sidebarBg}
          onCommit={commit}
        />
        <ColorSwatch
          kind="sidebarText"
          label="Letras"
          value={colors.sidebarText}
          draft={draft.sidebarText}
          onCommit={commit}
        />
      </div>
      <p
        className="appearance-preview appearance-preview-sidebar"
        style={{ background: colors.sidebarBg, color: colors.sidebarText }}
      >
        Cuadratura · Administración Segurida… · Cerrar sesión
      </p>

      <div className="field">
        <span className="field-label">Combinaciones</span>
        <div className="appearance-presets">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className="appearance-preset"
              style={{ background: p.bg, color: p.text }}
              onClick={() =>
                setColors({
                  bg: p.bg,
                  text: p.text,
                  sidebarBg: p.sidebarBg,
                  sidebarText: p.sidebarText,
                })
              }
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="appearance-actions">
        <button type="button" className="btn secondary sm" disabled={!custom} onClick={resetColors}>
          Restaurar colores
        </button>
        <span className="muted">
          {custom ? 'Colores propios de este tema.' : 'Usando los colores institucionales.'}
        </span>
      </div>

      <h3 className="appearance-h">Recuadros de cuadratura</h3>
      <p className="muted">Fondo, letras, orden y visibilidad de la leyenda.</p>
      <ul className="appearance-box-list">
        {boxes.map((b, i) => (
          <BoxRow
            key={b.id}
            box={b}
            index={i}
            total={boxes.length}
            onPatch={(id, patch) => patchBox('boxes', id, patch)}
            onMove={(id, dir) => moveBox('boxes', id, dir)}
          />
        ))}
      </ul>

      <h3 className="appearance-h">Recuadros de ocupación</h3>
      <ul className="appearance-box-list">
        {ocupacion.map((b, i) => (
          <BoxRow
            key={b.id}
            box={b}
            index={i}
            total={ocupacion.length}
            onPatch={(id, patch) => patchBox('ocupacion', id, patch)}
            onMove={(id, dir) => moveBox('ocupacion', id, dir)}
          />
        ))}
      </ul>

      <h3 className="appearance-h">Paneles de cuadratura</h3>
      <p className="muted">Qué se ve debajo de la grilla, y en qué orden. Queda guardado para tu usuario.</p>
      <ul className="appearance-box-list">
        {paneles.map((p, i) => (
          <li key={p.id} className={`appearance-box-row${p.visible ? '' : ' is-off'}`}>
            <label className="appearance-box-vis">
              <input
                type="checkbox"
                checked={p.visible}
                onChange={() => togglePanel(p.id)}
                aria-label={`Mostrar ${p.label}`}
              />
            </label>
            <span className="appearance-box-name">{p.label}</span>
            <span className="appearance-box-move">
              <button type="button" disabled={i === 0} onClick={() => movePanel(p.id, -1)}>
                ↑
              </button>
              <button
                type="button"
                disabled={i === paneles.length - 1}
                onClick={() => movePanel(p.id, 1)}
              >
                ↓
              </button>
            </span>
          </li>
        ))}
      </ul>

      <h3 className="appearance-h">Barra superior</h3>
      <ul className="appearance-box-list">
        {topbar.map((t, i) => (
          <li key={t.id} className={`appearance-box-row${t.visible ? '' : ' is-off'}`}>
            <label className="appearance-box-vis">
              <input
                type="checkbox"
                checked={t.visible}
                onChange={() => toggleTopbar(t.id)}
                aria-label={`Mostrar ${t.label}`}
              />
            </label>
            <span className="appearance-box-name">{t.label}</span>
            <span className="appearance-box-move">
              <button type="button" disabled={i === 0} onClick={() => moveBox('topbar', t.id, -1)}>
                ↑
              </button>
              <button
                type="button"
                disabled={i === topbar.length - 1}
                onClick={() => moveBox('topbar', t.id, 1)}
              >
                ↓
              </button>
            </span>
          </li>
        ))}
      </ul>

      <div className="appearance-actions">
        <button type="button" className="btn secondary sm" onClick={resetBoxes}>
          Restaurar recuadros
        </button>
        <button type="button" className="btn secondary sm" onClick={resetPaneles}>
          Restaurar paneles
        </button>
      </div>
    </div>
  );
}
