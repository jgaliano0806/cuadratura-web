from __future__ import annotations

import argparse
import json

from .excel_initializer import parse_excel, preview_to_json
from .postgres_repository import PostgresInitializerRepository


def main() -> None:
    parser = argparse.ArgumentParser(prog="sv-inicializador")
    commands = parser.add_subparsers(dest="command", required=True)

    preview_cmd = commands.add_parser("preview", help="Validar el Excel y generar preview JSON")
    preview_cmd.add_argument("excel")
    preview_cmd.add_argument("--output", default="initialization-preview.json")

    stage_cmd = commands.add_parser("stage", help="Cargar staging PostgreSQL")
    stage_cmd.add_argument("excel")
    stage_cmd.add_argument("--dsn", required=True)
    stage_cmd.add_argument("--user-id", required=True)

    confirm_cmd = commands.add_parser("confirm", help="Confirmar inicialización validada")
    confirm_cmd.add_argument("initialization_id")
    confirm_cmd.add_argument("--dsn", required=True)
    confirm_cmd.add_argument("--user-id", required=True)

    revert_cmd = commands.add_parser("revert", help="Revertir antes del inicio operativo")
    revert_cmd.add_argument("initialization_id")
    revert_cmd.add_argument("--dsn", required=True)
    revert_cmd.add_argument("--user-id", required=True)
    revert_cmd.add_argument("--reason", required=True)

    args = parser.parse_args()
    if args.command == "preview":
        result = parse_excel(args.excel)
        preview_to_json(result, args.output)
        print(json.dumps({"valid": result.is_valid, "inspectors": len(result.inspectors),
                          "date_from": str(result.date_from), "date_to": str(result.date_to),
                          "issues": len(result.issues), "output": args.output}, ensure_ascii=False))
    elif args.command == "stage":
        result = parse_excel(args.excel)
        init_id = PostgresInitializerRepository(args.dsn).stage(result, args.user_id)
        print(json.dumps({"initialization_id": init_id, "valid": result.is_valid}, ensure_ascii=False))
    elif args.command == "confirm":
        PostgresInitializerRepository(args.dsn).confirm(args.initialization_id, args.user_id)
        print(json.dumps({"status": "CONFIRMADA"}))
    elif args.command == "revert":
        PostgresInitializerRepository(args.dsn).revert(args.initialization_id, args.user_id, args.reason)
        print(json.dumps({"status": "REVERTIDA"}))


if __name__ == "__main__":
    main()
