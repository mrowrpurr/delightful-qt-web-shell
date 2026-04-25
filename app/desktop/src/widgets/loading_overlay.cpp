// LoadingOverlay — fade-out overlay shown while web content loads.
//
// Sits on top of its parent widget, auto-resizes via eventFilter,
// and fades out with a 300ms animation when dismiss() is called.

#include "loading_overlay.hpp"

#include <QGraphicsOpacityEffect>
#include <QLabel>
#include <QProgressBar>
#include <QPropertyAnimation>
#include <QResizeEvent>
#include <QTimer>
#include <QVBoxLayout>

// Must match --bg in App.css — prevents white flash before web content loads.
static constexpr QColor kBackground{0x24, 0x24, 0x24};

LoadingOverlay::LoadingOverlay(Style style, QWidget* parent)
    : QWidget(parent), style_(style)
{
    setStyleSheet(
        QStringLiteral("background-color: %1;").arg(kBackground.name()));

    auto* layout = new QVBoxLayout(this);
    layout->setAlignment(Qt::AlignCenter);

    if (style == Full) {
        // App logo — scaled from the embedded icon resource
        logo_ = new QLabel(this);
        logo_->setPixmap(
            QPixmap(":/icon.png").scaled(
                128, 128, Qt::KeepAspectRatio, Qt::SmoothTransformation));
        logo_->setAlignment(Qt::AlignCenter);
        layout->addStretch();
        layout->addWidget(logo_);
        layout->addSpacing(24);
    } else {
        layout->addStretch();
    }

    // Indeterminate progress bar — thin, styled, always present
    progressBar_ = new QProgressBar(this);
    progressBar_->setRange(0, 0);
    progressBar_->setTextVisible(false);
    progressBar_->setFixedHeight(4);
    progressBar_->setFixedWidth(200);
    progressBar_->setStyleSheet(
        "QProgressBar { border: none; background: rgba(255, 255, 255, 0.1); border-radius: 2px; }"
        "QProgressBar::chunk { background: #4a9eff; border-radius: 2px; }"
    );
    layout->addWidget(progressBar_, 0, Qt::AlignCenter);
    layout->addStretch();

    // Fill the parent immediately
    if (parent) {
        setGeometry(0, 0, parent->width(), parent->height());
        parent->installEventFilter(this);
    }
    raise();

    // Safety timeout (Full mode only): if dismiss() isn't called within 15s,
    // show an error so the user knows something went wrong.
    if (style == Full) {
        QTimer::singleShot(15000, this, [this]() {
            if (!dismissed_) showError();
        });
    }
}

void LoadingOverlay::dismiss() {
    if (dismissed_) return;
    dismissed_ = true;

    auto* effect = new QGraphicsOpacityEffect(this);
    setGraphicsEffect(effect);

    auto* fadeOut = new QPropertyAnimation(effect, "opacity");
    fadeOut->setDuration(300);
    fadeOut->setStartValue(1.0);
    fadeOut->setEndValue(0.0);
    fadeOut->setEasingCurve(QEasingCurve::OutCubic);
    connect(fadeOut, &QPropertyAnimation::finished, this, &QWidget::deleteLater);
    fadeOut->start(QAbstractAnimation::DeleteWhenStopped);
}

bool LoadingOverlay::eventFilter(QObject* watched, QEvent* event) {
    // Keep the overlay sized to its parent
    if (watched == parent() && event->type() == QEvent::Resize) {
        auto* re = static_cast<QResizeEvent*>(event);
        setGeometry(0, 0, re->size().width(), re->size().height());
    }
    return false;
}

void LoadingOverlay::showError() {
    progressBar_->hide();
    if (logo_) logo_->hide();

    auto* errorLabel = new QLabel(this);
    errorLabel->setText(
        "Bridge connection failed.\n\nCheck the console (F12) or restart the app.");
    errorLabel->setAlignment(Qt::AlignCenter);
    errorLabel->setStyleSheet("color: #ff6b6b; font-size: 14px;");
    layout()->addWidget(errorLabel);

    qWarning() << "signalReady() was not called within 15 seconds — bridge may be broken.";
}
