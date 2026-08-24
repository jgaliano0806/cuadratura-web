type Props = {
  width?: string | number;
  height?: string | number;
  rounded?: number | string;
  block?: boolean;
  className?: string;
};

/**
 * Placeholder animado (shimmer suave) para reemplazar contenido mientras carga.
 * Respeta `prefers-reduced-motion` cortando la animación desde CSS.
 */
export function Skeleton({ width, height = '1rem', rounded, block, className }: Props) {
  return (
    <span
      aria-hidden
      className={`skeleton${block ? ' skeleton-block' : ''}${className ? ' ' + className : ''}`}
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
        borderRadius:
          typeof rounded === 'number' ? `${rounded}px` : rounded ?? '4px',
      }}
    />
  );
}

export function SkeletonRow({ cols }: { cols: number }) {
  return (
    <tr aria-hidden>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i}>
          <Skeleton width={`${60 + ((i * 13) % 40)}%`} />
        </td>
      ))}
    </tr>
  );
}

export function SkeletonTable({
  cols,
  rows = 5,
}: {
  cols: number;
  rows?: number;
}) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} cols={cols} />
      ))}
    </>
  );
}
