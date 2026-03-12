"""Test that the Qt app window exists and has the right properties."""

from assertpy import assert_that


def test_window_is_visible(app):
    assert_that(app.is_visible()).is_true()


def test_window_has_correct_title(app):
    assert_that(app.window_text()).is_equal_to("Delightful Qt Web Shell")


def test_window_has_reasonable_size(app):
    rect = app.rectangle()
    assert_that(rect.width()).is_greater_than(400)
    assert_that(rect.height()).is_greater_than(300)
