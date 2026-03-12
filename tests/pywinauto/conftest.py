"""Shared fixtures for pywinauto tests.

These tests require the desktop app to be running:
    xmake run start-desktop

Run with:
    uv run pytest tests/pywinauto/
"""

import time

import pytest
from pywinauto import Desktop


APP_TITLE = "Delightful Qt Web Shell"
APP_CLASS = "QMainWindow"


@pytest.fixture
def desktop():
    return Desktop(backend="uia")


@pytest.fixture
def app(desktop):
    """Find the running Qt app window. Fails if the app isn't running."""
    try:
        window = desktop.window(title=APP_TITLE, class_name=APP_CLASS)
        window.wait("visible", timeout=5)
        return window
    except Exception:
        pytest.fail(
            f"App not found. Is it running? Start it with: xmake run start-desktop"
        )


@pytest.fixture
def close_dialogs(desktop):
    """After each test, close any leftover dialogs so they don't leak into the next test."""
    yield
    time.sleep(0.3)
    for title_pattern in ["About", "Export Data", "Save", "Open"]:
        try:
            dialog = desktop.window(title_re=f".*{title_pattern}.*", timeout=0.5)
            if dialog.exists():
                dialog.close()
        except Exception:
            pass
