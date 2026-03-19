// StatusBar — contextual info at the bottom of the window.
//
// Layout:
//   [ temporary message area          ] [ Ready ] [ 100% ]
//
// The left side shows temporary flash() messages that auto-clear.
// The right side has permanent widgets: status indicator + zoom level.

#include "status_bar.hpp"

#include <QLabel>

StatusBar::StatusBar(QWidget* parent)
    : QStatusBar(parent)
{
    // Permanent widget: general status (right-aligned, always visible)
    statusLabel_ = new QLabel("Ready");
    addPermanentWidget(statusLabel_);

    // Permanent widget: zoom level (right-aligned, always visible)
    zoomLabel_ = new QLabel("100%");
    addPermanentWidget(zoomLabel_);
}

void StatusBar::setZoomLevel(int percent) {
    zoomLabel_->setText(QString("%1%").arg(percent));
}

void StatusBar::flash(const QString& message, int timeout) {
    showMessage(message, timeout);
}
