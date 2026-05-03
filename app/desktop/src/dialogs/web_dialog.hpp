// WebDialog — a QDialog with embedded React content via WebShellWidget.
//
// This proves the concept: React isn't just for the main window. You can
// pop open a dialog with its own QWebEngineView, sharing the same bridges
// as every other view. One source of truth, signals everywhere.
//
// Usage:
//   WebDialog dlg(parentWindow);
//   dlg.exec();  // modal — or dlg.show() for modeless
//
// The dialog gets a Spinner overlay (not the full app logo) since the user
// is already inside the app. It loads the same React app — your React code
// can check the URL hash/params to render different content in dialogs.

#pragma once

#include <QDialog>

class WebShellWidget;

namespace app_shell { class App; }

class WebDialog : public QDialog {
    Q_OBJECT

public:
    explicit WebDialog(app_shell::App& app, QWidget* parent = nullptr);

private:
    WebShellWidget* webShell_ = nullptr;
};
