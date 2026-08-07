from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import date
from typing import Any


@dataclass(frozen=True)
class Issue:
    severity: str
    code: str
    detail: str
    row: int | None = None
    column: str | None = None
    value: str | None = None


@dataclass(frozen=True)
class ParsedDay:
    date: date
    source_code: str
    code: str
    day_type: str
    shift: str | None
    mobile: int | None
    is_novelty: bool
    month: str | None
    cell: str


@dataclass(frozen=True)
class ParsedBlock:
    sequence: int
    block_type: str
    start: date
    end: date
    shift: str | None
    mobile: int | None
    partial: bool


@dataclass
class ParsedInspector:
    ordinal: int
    source_row: int
    source_name: str
    name: str
    name_key: str
    employee_no: str
    days: list[ParsedDay] = field(default_factory=list)
    blocks: list[ParsedBlock] = field(default_factory=list)
    cycle_offset: int = 0
    position_code: str = ""
    position_type: str = "GENERAL"
    rest_group_code: str = ""
    profile_code: str = "ROTACION_GENERAL"
    anchor_date: date | None = None
    cycle_start_position: int = 0
    initial_shift: str | None = None
    initial_mobile: int | None = None
    state_date: date | None = None
    state_code: str = "F"
    shift_index: int | None = None
    mobile_index: int | None = None
    linked_group_code: str | None = None
    linked_role: str | None = None


@dataclass
class InitializationPreview:
    file_name: str
    sheet_name: str
    sha256: str
    date_from: date
    date_to: date
    inspectors: list[ParsedInspector]
    issues: list[Issue]
    linked_pairs: list[dict[str, Any]]
    metadata: dict[str, Any] = field(default_factory=dict)

    @property
    def is_valid(self) -> bool:
        return not any(issue.severity == "ERROR" for issue in self.issues)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)
