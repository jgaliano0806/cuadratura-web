from __future__ import annotations

import hashlib
import json
import re
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Iterable

from artifact_tool import Blob, SpreadsheetFile

from .models import InitializationPreview, Issue, ParsedBlock, ParsedDay, ParsedInspector
from .normalization import normalize_code, normalize_display_name, normalize_key, normalize_sheet_name

TARGET_SHEET_KEY = "moviles cba 26 27"
TARGET_RANGE = "A1:OP56"
ALLOWED_CODES = {"F", "V", "EF"} | {
    f"{shift}{mobile}" for shift in "MTN" for mobile in range(1, 6)
}
SHIFT_SEQUENCE = ["M", "N", "T"]
MOBILE_SEQUENCE = [1, 5, 3, 2]
M4_OFFSETS = {0: "M4-P01", 1: "M4-P02", 3: "M4-P03", 4: "M4-P04", 6: "M4-P05"}


def excel_column(index_zero_based: int) -> str:
    value = index_zero_based + 1
    result = ""
    while value:
        value, rem = divmod(value - 1, 26)
        result = chr(65 + rem) + result
    return result


def as_date(value: object) -> date | None:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, (int, float)) and 40000 <= value <= 70000:
        return (datetime(1899, 12, 30) + timedelta(days=float(value))).date()
    return None


def classify_code(code: str) -> tuple[str, str | None, int | None, bool]:
    if code == "F":
        return "FRANCO", None, None, False
    if code == "V":
        return "VACACION", None, None, True
    if code == "EF":
        return "ENFERMEDAD", None, None, True
    if re.fullmatch(r"[MTN][1-5]", code):
        return "TRABAJO", code[0], int(code[1]), False
    raise ValueError(code)


def forward_fill(values: Iterable[object]) -> list[str | None]:
    result: list[str | None] = []
    current: str | None = None
    for value in values:
        if value is not None and str(value).strip():
            current = str(value).strip()
        result.append(current)
    return result


def infer_cycle_offset(days: list[ParsedDay], origin: date) -> int:
    best = (-1.0, 0)
    for offset in range(8):
        valid = 0
        correct = 0
        for day in days:
            if day.is_novelty:
                continue
            actual = "F" if day.day_type == "FRANCO" else "W"
            phase = ((day.date - origin).days - offset) % 8
            expected = "W" if phase < 5 else "F"
            valid += 1
            correct += int(actual == expected)
        score = correct / valid if valid else 0.0
        if score > best[0]:
            best = (score, offset)
    return best[1]


def make_blocks(days: list[ParsedDay]) -> list[ParsedBlock]:
    eligible = [d for d in days if not d.is_novelty]
    blocks: list[ParsedBlock] = []
    current: list[ParsedDay] = []
    sequence = 0
    for day in eligible:
        same = bool(current) and day.date == current[-1].date + timedelta(days=1)
        if current:
            if current[0].day_type == "FRANCO":
                same = same and day.day_type == "FRANCO"
            else:
                same = same and day.day_type == "TRABAJO" and day.code == current[0].code
        if not same and current:
            sequence += 1
            first, last = current[0], current[-1]
            expected = 3 if first.day_type == "FRANCO" else 5
            blocks.append(ParsedBlock(sequence, "FRANCO" if first.day_type == "FRANCO" else "TRABAJO",
                                      first.date, last.date, first.shift, first.mobile, len(current) != expected))
            current = []
        current.append(day)
    if current:
        sequence += 1
        first, last = current[0], current[-1]
        expected = 3 if first.day_type == "FRANCO" else 5
        blocks.append(ParsedBlock(sequence, "FRANCO" if first.day_type == "FRANCO" else "TRABAJO",
                                  first.date, last.date, first.shift, first.mobile, len(current) != expected))
    return blocks


def detect_linked_pairs(inspectors: list[ParsedInspector]) -> list[dict]:
    candidates = [i for i in inspectors if any(d.mobile == 4 for d in i.days)]
    pairs: list[dict] = []
    for pos, first in enumerate(candidates):
        second_map = {d.date: d for d in first.days}
        for second in candidates[pos + 1:]:
            comparable = 0
            valid = 0
            for day in second.days:
                other = second_map.get(day.date)
                if not other or day.is_novelty or other.is_novelty:
                    continue
                comparable += 1
                if day.day_type == other.day_type == "FRANCO":
                    valid += 1
                elif day.day_type == other.day_type == "TRABAJO" and day.shift == other.shift:
                    if (day.mobile == 4) ^ (other.mobile == 4):
                        valid += 1
            if comparable >= 90 and valid == comparable:
                pairs.append({"first": first.name, "second": second.name, "comparable_days": comparable})
    return pairs


def assign_positions(inspectors: list[ParsedInspector], origin: date, linked_pairs: list[dict]) -> None:
    linked_names = set()
    for pair in linked_pairs:
        linked_names.update({pair["first"], pair["second"]})

    for inspector in inspectors:
        inspector.cycle_offset = infer_cycle_offset(inspector.days, origin)
        inspector.anchor_date = origin + timedelta(days=inspector.cycle_offset)
        inspector.cycle_start_position = 0
        last_valid = next((d for d in reversed(inspector.days) if not d.is_novelty), inspector.days[-1])
        inspector.state_date = last_valid.date
        inspector.state_code = last_valid.code
        inspector.initial_shift = last_valid.shift
        inspector.initial_mobile = last_valid.mobile
        if last_valid.shift in SHIFT_SEQUENCE:
            inspector.shift_index = SHIFT_SEQUENCE.index(last_valid.shift)
        if last_valid.mobile in MOBILE_SEQUENCE:
            inspector.mobile_index = MOBILE_SEQUENCE.index(last_valid.mobile)

        has_m4 = any(d.mobile == 4 for d in inspector.days)
        if has_m4 and inspector.cycle_offset in M4_OFFSETS:
            inspector.position_code = M4_OFFSETS[inspector.cycle_offset]
            inspector.position_type = "MOVIL4"
            inspector.rest_group_code = f"GF-{inspector.position_code}"
            inspector.profile_code = "MOVIL4_FIJO"
        else:
            inspector.position_code = f"GEN-{inspector.ordinal:03d}"
            inspector.position_type = "GENERAL"
            inspector.rest_group_code = f"GF-GEN-{inspector.ordinal:03d}"
            inspector.profile_code = "ROTACION_GENERAL"

    # La dupla comparte fase; la persona que ocupa móvil externo al final va a la posición EXT.
    for pair in linked_pairs:
        members = [i for i in inspectors if i.name in {pair["first"], pair["second"]}]
        if len(members) != 2:
            continue
        common_dates = sorted(set(d.date for d in members[0].days) & set(d.date for d in members[1].days), reverse=True)
        current_m4 = None
        for current_date in common_dates:
            d1 = next(d for d in members[0].days if d.date == current_date)
            d2 = next(d for d in members[1].days if d.date == current_date)
            if d1.day_type == d2.day_type == "TRABAJO" and ((d1.mobile == 4) ^ (d2.mobile == 4)):
                current_m4 = members[0] if d1.mobile == 4 else members[1]
                break
        if current_m4 is None:
            continue
        external = members[1] if current_m4 is members[0] else members[0]
        current_m4.position_code = "M4-P03"
        current_m4.position_type = "MOVIL4"
        current_m4.rest_group_code = "GF-M4-P03"
        current_m4.profile_code = "MOVIL4_FIJO"
        current_m4.linked_group_code = "GRV-M4-P03"
        current_m4.linked_role = "MOVIL4"
        external.position_code = "M4-P03-EXT"
        external.position_type = "VINCULADA"
        external.rest_group_code = "GF-M4-P03"
        external.profile_code = "VINCULADA_EXTERNA"
        external.linked_group_code = "GRV-M4-P03"
        external.linked_role = "MOVIL_EXTERNO"


def parse_excel(path: str | Path) -> InitializationPreview:
    file_path = Path(path)
    workbook = SpreadsheetFile.import_xlsx(Blob.load(str(file_path)))
    sheets = workbook.worksheets
    matches = []
    for index in range(0, 50):
        try:
            item = sheets.get_item_at(index)
        except Exception:
            break
        key = normalize_sheet_name(item.name)
        if key == TARGET_SHEET_KEY:
            matches.append(item)
    if len(matches) != 1:
        raise ValueError(f"Se esperaba una única hoja exacta 'Móviles Cba 26-27'; encontradas: {[s.name for s in matches]}")
    sheet = matches[0]
    values = sheet.get_range(TARGET_RANGE).values
    issues: list[Issue] = []

    header_index = None
    for idx, row in enumerate(values):
        if row and normalize_key(str(row[0] or "")) == "inspector de movil":
            header_index = idx
            break
    if header_index is None:
        raise ValueError("No se encontró la fila 'INSPECTOR DE MÓVIL'")

    all_date_columns: list[tuple[int, date]] = []
    for col in range(2, len(values[header_index])):
        parsed = as_date(values[header_index][col])
        if parsed:
            all_date_columns.append((col, parsed))
    if not all_date_columns:
        raise ValueError("No se encontraron fechas operativas")
    for (_, previous), (_, current) in zip(all_date_columns, all_date_columns[1:]):
        if current != previous + timedelta(days=1):
            issues.append(Issue("ERROR", "FECHAS_NO_CONTIGUAS", f"Salto entre {previous} y {current}"))

    # La planilla contiene columnas futuras parcialmente preparadas. El histórico
    # utilizable termina en la última columna contigua donde todos los inspectores
    # numerados poseen un código válido. Lo posterior se informa y no se inventa.
    inspector_row_indexes: list[int] = []
    blank_count = 0
    for row_index in range(header_index + 1, len(values)):
        row = values[row_index]
        ordinal_raw = row[0] if row else None
        name_raw = row[1] if len(row) > 1 else None
        if isinstance(ordinal_raw, str) and normalize_key(ordinal_raw) == "movil":
            break
        if ordinal_raw in (None, "") and name_raw in (None, ""):
            blank_count += 1
            if blank_count >= 2:
                break
            continue
        if ordinal_raw not in (None, "") and name_raw in (None, ""):
            break
        blank_count = 0
        if ordinal_raw not in (None, "") and name_raw not in (None, ""):
            inspector_row_indexes.append(row_index)

    date_columns: list[tuple[int, date]] = []
    first_incomplete: tuple[int, date] | None = None
    for col, current_date in all_date_columns:
        complete = True
        for row_index in inspector_row_indexes:
            raw = values[row_index][col] if col < len(values[row_index]) else None
            if normalize_code(raw) not in ALLOWED_CODES:
                complete = False
                break
        if complete and first_incomplete is None:
            date_columns.append((col, current_date))
        else:
            first_incomplete = first_incomplete or (col, current_date)
    if not date_columns:
        raise ValueError("No existe un tramo histórico completo")
    if first_incomplete is not None:
        ignored = len(all_date_columns) - len(date_columns)
        issues.append(Issue(
            "ADVERTENCIA", "COLUMNAS_FUTURAS_IGNORADAS",
            f"Se ignoraron {ignored} columnas incompletas desde {first_incomplete[1]} hasta {all_date_columns[-1][1]}"
        ))

    month_row_index = max(header_index - 2, 0)
    months = forward_fill(values[month_row_index])
    inspectors: list[ParsedInspector] = []
    expected_ordinal = 1
    blank_count = 0
    for row_index in range(header_index + 1, len(values)):
        row = values[row_index]
        ordinal_raw = row[0] if row else None
        name_raw = row[1] if len(row) > 1 else None
        if isinstance(ordinal_raw, str) and normalize_key(ordinal_raw) == "movil":
            break
        if ordinal_raw in (None, "") and name_raw in (None, ""):
            blank_count += 1
            if blank_count >= 2:
                break
            continue
        if ordinal_raw not in (None, "") and name_raw in (None, ""):
            break
        blank_count = 0
        try:
            ordinal = int(ordinal_raw)
        except (TypeError, ValueError):
            issues.append(Issue("ERROR", "ORDINAL_INVALIDO", "La primera columna debe ser numérica", row_index + 1, "A", str(ordinal_raw)))
            continue
        if not name_raw:
            issues.append(Issue("ERROR", "NOMBRE_VACIO", "Inspector sin nombre", row_index + 1, "B"))
            continue
        if ordinal != expected_ordinal:
            issues.append(Issue("ERROR", "ORDINAL_NO_CONTIGUO", f"Se esperaba {expected_ordinal} y se encontró {ordinal}", row_index + 1, "A", str(ordinal)))
        expected_ordinal = ordinal + 1
        name = normalize_display_name(str(name_raw))
        inspector = ParsedInspector(ordinal, row_index + 1, str(name_raw), name, normalize_key(name), f"EXCEL-{ordinal:03d}")
        for col, current_date in date_columns:
            raw = row[col] if col < len(row) else None
            code = normalize_code(raw)
            cell = f"{excel_column(col)}{row_index + 1}"
            if not code:
                issues.append(Issue("ERROR", "CODIGO_VACIO", f"Código vacío para {name} el {current_date}", row_index + 1, excel_column(col)))
                continue
            if code not in ALLOWED_CODES:
                issues.append(Issue("ERROR", "CODIGO_INVALIDO", f"Código no reconocido: {code}", row_index + 1, excel_column(col), str(raw)))
                continue
            day_type, shift, mobile, novelty = classify_code(code)
            inspector.days.append(ParsedDay(current_date, str(raw), code, day_type, shift, mobile, novelty, months[col], cell))
        inspector.blocks = make_blocks(inspector.days)
        inspectors.append(inspector)

    linked_pairs = detect_linked_pairs(inspectors)
    assign_positions(inspectors, date_columns[0][1], linked_pairs)

    position_codes = [i.position_code for i in inspectors]
    duplicates = {code for code in position_codes if position_codes.count(code) > 1}
    allowed_duplicate = {"M4-P03"} if linked_pairs else set()
    for code in sorted(duplicates - allowed_duplicate):
        issues.append(Issue("ERROR", "POSICION_DUPLICADA", f"Más de un inspector fue asignado a {code}"))

    return InitializationPreview(
        file_name=file_path.name,
        sheet_name=sheet.name,
        sha256=hashlib.sha256(file_path.read_bytes()).hexdigest(),
        date_from=date_columns[0][1],
        date_to=date_columns[-1][1],
        inspectors=inspectors,
        issues=issues,
        linked_pairs=linked_pairs,
        metadata={
            "header_row": header_index + 1,
            "date_columns": len(date_columns),
            "source_date_to": str(all_date_columns[-1][1]),
            "historical_cutoff": str(date_columns[-1][1]),
            "merged_header_strategy": "forward-fill solo en encabezados; nunca en filas operativas",
            "allowed_codes": sorted(ALLOWED_CODES),
        },
    )


def preview_to_json(preview: InitializationPreview, path: str | Path) -> None:
    Path(path).write_text(json.dumps(preview.to_dict(), ensure_ascii=False, indent=2, default=str), encoding="utf-8")
