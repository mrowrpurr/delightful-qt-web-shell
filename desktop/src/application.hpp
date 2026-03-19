// Application — custom QApplication subclass.
//
// Owns app-level concerns: identity, bridges, system tray, single-instance guard.
// Widgets and windows come later — the app can run without any visible window
// (e.g. system tray only).

#pragma once

#include <QApplication>

class Application : public QApplication {
    Q_OBJECT

public:
    Application(int& argc, char** argv);
};
