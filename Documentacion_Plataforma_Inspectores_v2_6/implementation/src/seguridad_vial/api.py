from __future__ import annotations

import os
from datetime import date
from pathlib import Path
from tempfile import NamedTemporaryFile

from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.responses import HTMLResponse

from .excel_initializer import parse_excel
from .postgres_repository import OperationsRepository, PostgresInitializerRepository

app = FastAPI(title="Seguridad Vial Operaciones", version="2.6.0")


def dsn() -> str:
    value = os.getenv("DATABASE_URL")
    if not value:
        raise HTTPException(503, "DATABASE_URL no configurada")
    return value


@app.post("/initialization/excel/preview")
async def preview_excel(file: UploadFile = File(...)):
    suffix = Path(file.filename or "cronograma.xlsx").suffix or ".xlsx"
    with NamedTemporaryFile(suffix=suffix, delete=False) as temporary:
        temporary.write(await file.read())
        temp_path = temporary.name
    try:
        preview = parse_excel(temp_path)
        return preview.to_dict()
    finally:
        Path(temp_path).unlink(missing_ok=True)


@app.post("/initialization/excel/stage")
async def stage_excel(user_id: str, file: UploadFile = File(...)):
    suffix = Path(file.filename or "cronograma.xlsx").suffix or ".xlsx"
    with NamedTemporaryFile(suffix=suffix, delete=False) as temporary:
        temporary.write(await file.read())
        temp_path = temporary.name
    try:
        preview = parse_excel(temp_path)
        repository = PostgresInitializerRepository(dsn())
        initialization_id = repository.stage(preview, user_id)
        return {"initialization_id": initialization_id, "valid": preview.is_valid, "issues": preview.issues}
    finally:
        Path(temp_path).unlink(missing_ok=True)


@app.post("/initialization/{initialization_id}/confirm")
def confirm(initialization_id: str, user_id: str):
    PostgresInitializerRepository(dsn()).confirm(initialization_id, user_id)
    return {"status": "CONFIRMADA"}


@app.post("/initialization/{initialization_id}/revert")
def revert(initialization_id: str, user_id: str, reason: str):
    PostgresInitializerRepository(dsn()).revert(initialization_id, user_id, reason)
    return {"status": "REVERTIDA"}


@app.get("/operations/mobile4/positions")
def mobile4_positions():
    return OperationsRepository(dsn()).mobile4_positions()


@app.get("/reports/gaps")
def gaps(
    date_from: date | None = None,
    date_to: date | None = None,
    mobile: int | None = Query(None, ge=1, le=5),
    shift: str | None = Query(None, pattern="^[MTN]$"),
    acceptance: str | None = Query(None, pattern="^(PENDIENTE|JUSTIFICADO)$"),
    version_id: str | None = None,
):
    return OperationsRepository(dsn()).gaps(
        date_from=date_from, date_to=date_to, mobile=mobile, shift=shift,
        acceptance=acceptance, version_id=version_id,
    )


@app.get("/vacations/{novelty_id}/demand-work/proposals")
def vacation_proposals(novelty_id: str, version_id: str):
    return OperationsRepository(dsn()).vacation_demand_proposals(novelty_id, version_id)


@app.get("/dashboard/gaps", response_class=HTMLResponse)
def gaps_dashboard():
    html = Path(__file__).resolve().parents[2] / "dashboard" / "huecos.html"
    return html.read_text(encoding="utf-8")
