// StatusBar — the main window's status bar widget.
//
// Shows contextual information at the bottom of the window:
// connection status, zoom level, background activity, etc.
//
// This is a QStatusBar subclass so it can own permanent widgets
// (always visible) and handle temporary messages (auto-clearing).

#pragma once

#include <QStatusBar>

class QLabel;

class StatusBar : public QStatusBar {
    Q_OBJECT

public:
    explicit StatusBar(QWidget* parent = nullptr);

    // Update the zoom percentage display (e.g. "100%")
    void setZoomLevel(int percent);

public slots:
    // Show a temporary message that auto-clears after a few seconds
    void flash(const QString& message, int timeout = 3000);

private:
    QLabel* zoomLabel_ = nullptr;
    QLabel* statusLabel_ = nullptr;
};
