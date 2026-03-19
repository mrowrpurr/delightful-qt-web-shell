// Application — custom QApplication subclass.
//
// This is where app-wide setup lives. Everything that applies regardless of
// which windows are open belongs here: identity, bridges, system tray, etc.

#include "application.hpp"

Application::Application(int& argc, char** argv)
    : QApplication(argc, argv)
{
    setOrganizationName(APP_ORG);
    setApplicationName(APP_NAME);
}
