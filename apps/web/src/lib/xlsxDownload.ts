export async function bajarExcelPost(
  path: string,
  body: unknown,
  fallback: string,
): Promise<string> {
  const base = import.meta.env.VITE_API_URL || '/api';
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${localStorage.getItem('sv_token') ?? ''}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('No se pudo generar el archivo');
  const blob = await res.blob();
  const nombre =
    res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] ?? fallback;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(url);
  return nombre;
}
