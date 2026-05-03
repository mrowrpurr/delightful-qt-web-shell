// WebDialog — React inside a popup dialog, with hash-based routing.
//
// Same bridges, same React build, different route. The URL includes
// #/dialog, which React checks at mount time to render DialogView
// instead of the main App. One build, multiple UIs.

#include "web_dialog.hpp"
#include "shell/app.hpp"
#include "widgets/web_shell_widget.hpp"

#include <QVBoxLayout>

WebDialog::WebDialog(app_shell::App& app, QWidget* parent)
    : QDialog(parent)
{
    setWindowTitle(QString("%1 — Dialog").arg(APP_NAME));
    resize(600, 400);

    // Remove the "?" help button (Windows)
    setWindowFlags(windowFlags() & ~Qt::WindowContextHelpButtonHint);

    auto* layout = new QVBoxLayout(this);
    layout->setContentsMargins(0, 0, 0, 0);

    // Same React app as the main window, but with #/dialog hash route.
    // React checks window.location.hash at mount time and renders
    // DialogView instead of App — lightweight UI suited for a popup.
    QUrl dialogUrl = app.appUrl("main");
    dialogUrl.setFragment("/dialog");
    webShell_ = new WebShellWidget(
        app.webProfile(), app.registry(), app.lifecycle(), dialogUrl,
        WebShellWidget::SpinnerOverlay, this);
    layout->addWidget(webShell_);
}
