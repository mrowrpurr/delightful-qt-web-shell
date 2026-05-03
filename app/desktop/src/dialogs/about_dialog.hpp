// AboutDialog — a custom QDialog showing app info.
//
// This replaces QMessageBox::about() with a proper QDialog subclass to
// demonstrate the pattern: layout, widgets, buttons, accept/reject.
//
// Usage:
//   AboutDialog dlg(app.brandingImagePath(), parentWindow);
//   dlg.exec();  // modal

#pragma once

#include <QDialog>

class AboutDialog : public QDialog {
    Q_OBJECT

public:
    AboutDialog(const QString& brandingImagePath, QWidget* parent = nullptr);
};
