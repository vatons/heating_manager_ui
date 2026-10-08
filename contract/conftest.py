"""Run the cards' contract tests against a checkout of the Heating Manager integration.

HM_BACKEND points at the integration's repository (default: ../../heating_manager,
next to this repository). Its own test fixtures (fake TRVs, config entry builders)
are reused, so the integration runs here exactly as in its own test suite.
"""
import os
import sys
from pathlib import Path

BACKEND = Path(
    os.environ.get("HM_BACKEND", Path(__file__).resolve().parents[2] / "heating_manager")
).resolve()
if not (BACKEND / "custom_components" / "heating_manager").is_dir():
    raise RuntimeError(f"Heating Manager integration not found at {BACKEND}; set HM_BACKEND")
sys.path.insert(0, str(BACKEND))

pytest_plugins = ["tests.conftest"]
