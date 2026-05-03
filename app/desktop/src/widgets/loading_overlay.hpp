// LoadingOverlay — covers a parent widget while content loads.
//
// Two styles:
//   Full    — app logo + progress bar + error timeout. For the main window's
//             first launch, where you want a polished loading experience.
//   Spinner — just an indeterminate progress bar. For secondary views like
//             dialog popups where a full logo would be overkill.
//
// Usage:
//   auto* overlay = new LoadingOverlay(LoadingOverlay::Full,
//                                      app.brandingImagePath(), parentWidget);
//   // Later, when content is ready:
//   overlay->dismiss();   // fade out and delete
//
// The overlay auto-sizes to its parent via an event filter.
// If dismiss() isn't called within 15 seconds (Full mode), an error message
// replaces the spinner — so the user isn't left staring at nothing.

#pragma once

#include <QWidget>

class QLabel;
class QProgressBar;

class LoadingOverlay : public QWidget {
    Q_OBJECT

public:
    enum Style { Full, Spinner };

    LoadingOverlay(Style style, const QString& brandingImagePath, QWidget* parent);

    // Fade out the overlay and delete it when the animation finishes.
    // Safe to call multiple times — second call is a no-op.
    void dismiss();

protected:
    bool eventFilter(QObject* watched, QEvent* event) override;

private:
    void showError();

    Style style_;
    QLabel* logo_ = nullptr;
    QProgressBar* progressBar_ = nullptr;
    bool dismissed_ = false;
};
