import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

export type MembreteTimer = {
  empresa: string;
  titulo: string;
  subtitulo: string;
  codigo: string;
  revision: string;
  logo: string;
};

const DEFECTO: MembreteTimer = {
  empresa: 'Caminos de las Sierras',
  titulo: 'REGISTRO DE PROCESO',
  subtitulo: 'TIMER',
  codigo: 'RPASV019',
  revision: '01',
  logo: 'logo.png',
};

function dirs(): string[] {
  return [
    join(__dirname, '..', '..', 'assets', 'membrete'),
    join(process.cwd(), 'src', 'assets', 'membrete'),
    join(process.cwd(), 'dist', 'assets', 'membrete'),
  ];
}

function carpeta(): string | null {
  return dirs().find((d) => existsSync(d)) ?? null;
}

export function cargarMembreteTimer(): {
  cfg: MembreteTimer;
  logoPath: string | null;
} {
  const dir = carpeta();
  let cfg = { ...DEFECTO };
  if (dir && existsSync(join(dir, 'timer.json'))) {
    try {
      const raw = JSON.parse(readFileSync(join(dir, 'timer.json'), 'utf8')) as Partial<MembreteTimer>;
      cfg = {
        empresa: String(raw.empresa || DEFECTO.empresa),
        titulo: String(raw.titulo || DEFECTO.titulo),
        subtitulo: String(raw.subtitulo || DEFECTO.subtitulo),
        codigo: String(raw.codigo || DEFECTO.codigo),
        revision: String(raw.revision || DEFECTO.revision),
        logo: String(raw.logo || DEFECTO.logo),
      };
    } catch {
      cfg = { ...DEFECTO };
    }
  }
  const logoPath = dir ? join(dir, cfg.logo) : '';
  return { cfg, logoPath: logoPath && existsSync(logoPath) ? logoPath : null };
}
