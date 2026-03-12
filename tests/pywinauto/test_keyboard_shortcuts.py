"""Test that keyboard shortcuts trigger the correct native actions."""

import time

from assertpy import assert_that
from pywinauto import Desktop


def test_ctrl_e_opens_export_dialog(app, desktop, close_dialogs):
    """Ctrl+E should open the Export file dialog."""
    app.set_focus()
    app.type_keys("^e")  # ^ = Ctrl
    time.sleep(1)

    dialog = desktop.window(title="Export Data")
    assert_that(dialog.exists()).is_true()

    dialog.child_window(title="Cancel").click()
    time.sleep(0.3)


def test_f12_opens_dev_tools(app, desktop, close_dialogs):
    """F12 should open the Developer Tools window."""
    app.set_focus()
    app.type_keys("{F12}")
    time.sleep(1)

    dev_tools = desktop.window(title="Developer Tools")
    assert_that(dev_tools.exists()).is_true()

    dev_tools.close()
    time.sleep(0.3)
