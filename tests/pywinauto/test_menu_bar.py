"""Test the native Qt menu bar and its actions."""

import time

from assertpy import assert_that
from pywinauto import Desktop


def test_file_menu_has_export_and_quit(app):
    """File menu should have Export... and Quit actions."""
    menu = app.menu_item("File")
    assert_that(menu.exists()).is_true()


def test_help_menu_has_about(app):
    """Help menu should have an About action."""
    menu = app.menu_item("Help")
    assert_that(menu.exists()).is_true()


def test_about_dialog_opens_and_closes(app, desktop, close_dialogs):
    """Help > About should open a QMessageBox with app info."""
    app.menu_select("Help->About")
    time.sleep(0.5)

    dialog = desktop.window(title_re="About.*")
    assert_that(dialog.exists()).is_true()

    # Read the dialog content
    text = dialog.window_text()
    assert_that(text).contains("About")

    # Close it
    dialog.child_window(title="OK", class_name="QPushButton").click()
    time.sleep(0.3)


def test_export_dialog_opens_and_closes(app, desktop, close_dialogs):
    """File > Export... should open a QFileDialog."""
    app.menu_select("File->Export...")
    time.sleep(1)

    dialog = desktop.window(title="Export Data")
    assert_that(dialog.exists()).is_true()

    # Cancel the dialog
    dialog.child_window(title="Cancel").click()
    time.sleep(0.3)
