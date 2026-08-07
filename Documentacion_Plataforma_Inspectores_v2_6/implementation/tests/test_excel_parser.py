import os
from pathlib import Path

import pytest

from seguridad_vial.excel_initializer import parse_excel


@pytest.mark.integration
def test_official_excel_when_available():
    path = os.getenv("SV_TEST_EXCEL")
    if not path or not Path(path).exists():
        pytest.skip("SV_TEST_EXCEL no configurada")
    preview = parse_excel(path)
    assert preview.is_valid
    assert len(preview.inspectors) == 27
    assert str(preview.date_from) == "2026-05-01"
    assert str(preview.date_to) == "2026-10-05"
    assert any({p["first"], p["second"]} == {"Haro", "Ramos G."} for p in preview.linked_pairs)
