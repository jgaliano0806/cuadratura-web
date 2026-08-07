from seguridad_vial.normalization import normalize_code, normalize_display_name, normalize_key


def test_names():
    assert normalize_display_name("  Martínez   J. ") == "Martínez J."
    assert normalize_key("Bendayán") == "bendayan"


def test_codes():
    assert normalize_code(" n 4 ") == "N4"
    assert normalize_code(" ef ") == "EF"
