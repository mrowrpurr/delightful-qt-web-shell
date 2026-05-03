// Menu bar setup — builds the main window's menus.
//
// Menus live here, not in MainWindow, so the window file stays short and
// you can see all menu structure in one place. Add new menus and actions here.
//
// Toolbar uses the SAME QAction objects from the menu bar. That way the
// shortcut, tooltip, enabled state, and triggered signal stay in sync
// automatically — change it in one place, it updates everywhere.

#pragma once

class QAction;
class QMainWindow;

namespace app_shell { class App; }

// Actions that the caller may need to wire up to other widgets,
// or that the toolbar reuses.
struct MenuActions {
    // File menu
    QAction* save       = nullptr;
    QAction* openFolder = nullptr;

    // View menu
    QAction* zoomIn     = nullptr;
    QAction* zoomOut    = nullptr;
    QAction* zoomReset  = nullptr;

    // Windows / Tabs
    QAction* newWindow  = nullptr;
    QAction* newTab     = nullptr;
    QAction* closeTab   = nullptr;

    // Windows menu
    QAction* devTools   = nullptr;
};

// Builds the full menu bar: File, View, Windows, Help.
// Returns actions that need wiring to widgets and/or toolbar reuse.
MenuActions buildMenuBar(app_shell::App& app, QMainWindow* window);

// Builds the main toolbar using shared actions from the menu bar.
// Same QAction = same shortcut, tooltip, enabled state, signal.
void buildToolBar(app_shell::App& app, QMainWindow* window, const MenuActions& actions);
