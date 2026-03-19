// Qt desktop shell — the entry point.
// Everything interesting lives in the classes this file wires together.

#include "application.hpp"
#include "windows/main_window.hpp"

int main(int argc, char* argv[]) {
    Application app(argc, argv);

    MainWindow window;
    window.show();

    return app.exec();
}
