// Application — transitional thin subclass of app_shell::App.
//
// Phase 1 of the native refactor moved all behavior into app_shell::App.
// Application remains as a backward-compatible name so existing call sites
// (e.g. qobject_cast<Application*>(qApp)) keep working until later phases
// migrate them to typed App& references.

#pragma once

#include "shell/app.hpp"

class Application : public app_shell::App {
    Q_OBJECT
public:
    using App::App;
};
