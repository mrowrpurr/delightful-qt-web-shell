// AboutDialog — custom QDialog with app icon, name, version, and OK button.
//
// This demonstrates the QDialog pattern:
//   - QVBoxLayout for vertical arrangement
//   - QLabel for icon + text
//   - QPushButton wired to accept()
//   - setFixedSize for non-resizable dialog
//   - setWindowFlags to remove the "?" help button (Windows)

#include "about_dialog.hpp"

#include <QHBoxLayout>
#include <QLabel>
#include <QPushButton>
#include <QVBoxLayout>

AboutDialog::AboutDialog(const QString& brandingImagePath, QWidget* parent)
    : QDialog(parent)
{
    setWindowTitle(QString("About %1").arg(APP_NAME));
    setFixedSize(360, 200);

    // Remove the "?" help button that Windows adds to dialogs by default
    setWindowFlags(windowFlags() & ~Qt::WindowContextHelpButtonHint);

    auto* layout = new QVBoxLayout(this);
    layout->setSpacing(12);

    // ── Icon + text side by side ─────────────────────────────
    auto* topRow = new QHBoxLayout;

    auto* icon = new QLabel(this);
    icon->setPixmap(
        QPixmap(brandingImagePath).scaled(
            64, 64, Qt::KeepAspectRatio, Qt::SmoothTransformation));
    icon->setFixedSize(64, 64);
    topRow->addWidget(icon);

    auto* text = new QLabel(this);
    text->setText(
        QString("<h2>%1</h2>"
                "<p>Version %2</p>"
                "<p>A template for Qt + React desktop apps<br>"
                "with real testing and zero-boilerplate bridges.</p>")
            .arg(APP_NAME)
            .arg(APP_VERSION));
    text->setWordWrap(true);
    topRow->addWidget(text, 1);  // stretch = 1 → text takes remaining space

    layout->addLayout(topRow);
    layout->addStretch();

    // ── OK button ────────────────────────────────────────────
    auto* okButton = new QPushButton("OK", this);
    okButton->setDefault(true);
    connect(okButton, &QPushButton::clicked, this, &QDialog::accept);

    auto* buttonRow = new QHBoxLayout;
    buttonRow->addStretch();
    buttonRow->addWidget(okButton);
    layout->addLayout(buttonRow);
}
