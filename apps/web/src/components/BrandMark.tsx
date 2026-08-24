type Props = {
  /** Altura del logo PNG en píxeles. */
  size?: number;
  className?: string;
};

const LOGO_SRC = '/brand/caminos-sierras.png';

/** Logo institucional oficial (PNG). */
export function BrandMark({ size = 48, className }: Props) {
  return (
    <img
      className={`brand-logo-png${className ? ` ${className}` : ''}`}
      src={LOGO_SRC}
      alt="Caminos de las Sierras"
      height={size}
      width={Math.round(size * 2.2)}
      style={{ height: size, width: 'auto', display: 'block' }}
      decoding="async"
    />
  );
}
