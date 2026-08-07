#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?Defina DATABASE_URL, por ejemplo postgresql://usuario:clave@localhost:5432/seguridad_vial}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATIONS_DIR="$ROOT_DIR/migrations"

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
CREATE TABLE IF NOT EXISTS public.schema_migration (
    version varchar(255) PRIMARY KEY,
    aplicado_en timestamptz NOT NULL DEFAULT now(),
    checksum_sha256 char(64) NOT NULL
);
SQL

for file in "$MIGRATIONS_DIR"/*.sql; do
    version="$(basename "$file")"
    checksum="$(sha256sum "$file" | awk '{print $1}')"
    applied="$(psql "$DATABASE_URL" -Atqc "SELECT checksum_sha256 FROM public.schema_migration WHERE version = '$version'")"

    if [[ -n "$applied" ]]; then
        if [[ "$applied" != "$checksum" ]]; then
            echo "ERROR: la migración aplicada $version cambió de contenido" >&2
            exit 1
        fi
        echo "SKIP $version"
        continue
    fi

    echo "APPLY $version"
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$file"
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c \
        "INSERT INTO public.schema_migration(version, checksum_sha256) VALUES ('$version', '$checksum')"
done

echo "Migraciones completadas."
