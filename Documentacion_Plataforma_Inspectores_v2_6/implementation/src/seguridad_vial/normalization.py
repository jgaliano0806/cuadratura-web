from __future__ import annotations

import re
import unicodedata

_SPACE_RE = re.compile(r"\s+")
_DOT_RE = re.compile(r"\s*\.\s*")


def collapse_spaces(value: str) -> str:
    return _SPACE_RE.sub(" ", value.strip())


def normalize_display_name(value: str) -> str:
    value = unicodedata.normalize("NFKC", value or "")
    value = value.replace("’", "'").replace("`", "'")
    value = collapse_spaces(value)
    value = _DOT_RE.sub(".", value)
    return value


def normalize_key(value: str) -> str:
    value = normalize_display_name(value)
    value = unicodedata.normalize("NFD", value)
    value = "".join(ch for ch in value if unicodedata.category(ch) != "Mn")
    value = value.casefold()
    value = re.sub(r"[^a-z0-9]+", " ", value)
    return collapse_spaces(value)


def normalize_sheet_name(value: str) -> str:
    return normalize_key(value)


def normalize_code(value: object) -> str:
    if value is None:
        return ""
    return collapse_spaces(str(value)).upper().replace(" ", "")
