// Application — transitional thin subclass of app_shell::App.
//
// Phase 1 of the native refactor moved all behavior into app_shell::App and
// killed every qobject_cast<Application*>(qApp) site. Application stays only
// because main.cpp still names it; later phases will rename that and delete
// this shim.

#pragma once

#include "shell/app.hpp"

class Application : public app_shell::App {
    Q_OBJECT
public:
    using App::App;
};
