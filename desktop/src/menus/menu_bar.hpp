// Menu bar setup — builds the main window's menus.
//
// Menus live here, not in MainWindow, so the window file stays short and
// you can see all menu structure in one place. Add new menus and actions here.
//
// Toolbar actions are defined here too — they're often the same actions that
// appear in menus (e.g. Save, Open), just exposed as buttons.

#pragma once

class QMainWindow;

// Builds the full menu bar: File, View, Help.
// Attaches it to the given window.
void buildMenuBar(QMainWindow* window);

// Builds the main toolbar with common actions.
// Attaches it to the given window.
void buildToolBar(QMainWindow* window);
