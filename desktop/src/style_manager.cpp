// StyleManager — theme loading with three-source fallback, live reload,
// dark/light mode tracking, and smart theme switching.

#include "style_manager.hpp"

#include <QApplication>
#include <QDebug>
#include <QDir>
#include <QDirIterator>
#include <QFile>
#include <QFileInfo>
#include <QRegularExpression>
#include <QSet>
#include <QStandardPaths>
#include <QStyleHints>
#include <QTextStream>

#include <sass.h>

StyleManager::StyleManager(QObject* parent)
    : QObject(parent)
{
    // ── Determine active source ──────────────────────────────

#ifdef STYLES_DEV_PATH
    devPath_ = QString(STYLES_DEV_PATH);
    if (QDir(devPath_).exists()) {
        qDebug() << "[StyleManager] Dev styles path:" << devPath_;
    } else {
        qDebug() << "[StyleManager] Dev styles path does not exist:" << devPath_;
        devPath_.clear();
    }
#endif

    userPath_ = QStandardPaths::writableLocation(QStandardPaths::AppLocalDataLocation)
                + "/styles";

    if (!devPath_.isEmpty()) {
        setupWatcher(devPath_);
    } else if (QDir(userPath_).exists() && !QDir(userPath_).isEmpty()) {
        setupWatcher(userPath_);
    }

    connect(&watcher_, &QFileSystemWatcher::fileChanged,
            this, &StyleManager::onFileChanged);
    connect(&watcher_, &QFileSystemWatcher::directoryChanged,
            this, [this](const QString&) {
        if (!currentTheme_.isEmpty())
            applyTheme(currentTheme_);
    });
}

void StyleManager::setupWatcher(const QString& dir) {
    watchedDir_ = dir;
    watcher_.addPath(dir);

    QDirIterator it(dir, {"*.scss", "*.qss", "*.css"},
                    QDir::Files, QDirIterator::Subdirectories);
    while (it.hasNext())
        watcher_.addPath(it.next());

    qDebug() << "[StyleManager] Watching" << dir << "for live reload";
}

void StyleManager::onFileChanged(const QString& path) {
    qDebug() << "[StyleManager] File changed:" << path;

    if (QFile::exists(path) && !watcher_.files().contains(path))
        watcher_.addPath(path);

    if (!currentTheme_.isEmpty())
        applyTheme(currentTheme_);
}

void StyleManager::applyTheme(const QString& themeName) {
    QString qss = loadQss(themeName);

    if (qss.isEmpty()) {
        qDebug() << "[StyleManager] No QSS found for theme:" << themeName;
        return;
    }

    qApp->setStyleSheet(qss);
    currentTheme_ = themeName;

    // Track dark/light mode from the theme name
    if (themeName.endsWith("-dark")) {
        isDark_ = true;
        lastDarkTheme_ = themeName;
    } else if (themeName.endsWith("-light")) {
        isDark_ = false;
        lastLightTheme_ = themeName;
    }

    // If no display name was set (e.g. theme applied from toolbar slug),
    // default to "Default" so React can at least find the fallback theme.
    if (currentDisplayName_.isEmpty())
        currentDisplayName_ = "Default";

    // Update platform color scheme to match
    if (auto* hints = qApp->styleHints()) {
        hints->setColorScheme(isDark_ ? Qt::ColorScheme::Dark : Qt::ColorScheme::Light);
    }

    emit themeChanged();
    qDebug() << "[StyleManager] Applied theme:" << themeName
             << (isDark_ ? "(dark)" : "(light)")
             << (isLiveReload() ? "(live)" : "(QRC)");
}

void StyleManager::applyTheme(const QString& baseName, bool dark) {
    QString fullName = baseName + (dark ? "-dark" : "-light");
    if (themeExists(fullName)) {
        applyTheme(fullName);
    } else {
        applyTheme(dark ? "default-dark" : "default-light");
    }
}

void StyleManager::applyThemeByDisplayName(const QString& displayName, bool dark) {
    QString slug = slugify(displayName);
    currentDisplayName_ = displayName;
    if (dark) lastDarkDisplayName_ = displayName;
    else lastLightDisplayName_ = displayName;
    applyTheme(slug, dark);
}

void StyleManager::toggleDarkMode() {
    setDarkMode(!isDark_);
}

void StyleManager::setDarkMode(bool dark) {
    if (dark == isDark_) return;

    QString baseName = currentBaseName();
    QString target = baseName + (dark ? "-dark" : "-light");

    // Pick the display name for the target mode.
    // If we've never been in that mode, keep the current display name
    // (same theme base, just switching dark↔light).
    QString targetDisplayName = dark ? lastDarkDisplayName_ : lastLightDisplayName_;
    if (targetDisplayName.isEmpty()) targetDisplayName = currentDisplayName_;

    if (themeExists(target)) {
        currentDisplayName_ = targetDisplayName;
        applyTheme(target);
    } else {
        QString& lastForMode = dark ? lastDarkTheme_ : lastLightTheme_;
        if (!lastForMode.isEmpty() && themeExists(lastForMode)) {
            currentDisplayName_ = targetDisplayName;
            applyTheme(lastForMode);
        } else {
            currentDisplayName_ = "Default";
            applyTheme(dark ? "default-dark" : "default-light");
        }
    }
}

QString StyleManager::currentBaseName() const {
    return stripModeSuffix(currentTheme_);
}

QString StyleManager::stripModeSuffix(const QString& name) {
    if (name.endsWith("-dark")) return name.left(name.length() - 5);
    if (name.endsWith("-light")) return name.left(name.length() - 6);
    return name;
}

QString StyleManager::slugify(const QString& name) {
    QString slug = name.toLower();
    // Remove apostrophes
    slug.replace(QRegularExpression("[''']"), "");
    // Replace non-alnum with hyphens
    slug.replace(QRegularExpression("[^a-z0-9]+"), "-");
    // Trim leading/trailing hyphens
    slug.replace(QRegularExpression("^-+|-+$"), "");
    return slug;
}

bool StyleManager::themeExists(const QString& name) const {
    return !findThemeFile(name).isEmpty();
}

QString StyleManager::loadQss(const QString& themeName) const {
    QString filePath = findThemeFile(themeName);
    if (filePath.isEmpty()) return {};

    if (filePath.endsWith(".scss"))
        return compileScssToCss(filePath);

    QFile file(filePath);
    if (!file.open(QIODevice::ReadOnly | QIODevice::Text))
        return {};
    return QTextStream(&file).readAll();
}

QString StyleManager::findThemeFile(const QString& themeName) const {
    if (!watchedDir_.isEmpty()) {
        QString scssPath = watchedDir_ + "/themes/" + themeName + ".scss";
        if (QFile::exists(scssPath)) return scssPath;

        QString compiledPath = watchedDir_ + "/compiled/" + themeName + ".qss";
        if (QFile::exists(compiledPath)) return compiledPath;

        QString qssPath = watchedDir_ + "/" + themeName + ".qss";
        if (QFile::exists(qssPath)) return qssPath;
    }

    QString qrcPath = ":/styles/" + themeName + ".qss";
    if (QFile::exists(qrcPath)) return qrcPath;

    return {};
}

QString StyleManager::compileScssToCss(const QString& scssPath) const {
    QByteArray pathUtf8 = scssPath.toUtf8();

    struct Sass_File_Context* ctx = sass_make_file_context(pathUtf8.constData());
    struct Sass_Options* opts = sass_file_context_get_options(ctx);

    QString includeDir = QFileInfo(scssPath).absolutePath();
    sass_option_set_include_path(opts, includeDir.toUtf8().constData());
    sass_option_set_output_style(opts, SASS_STYLE_EXPANDED);
    sass_option_set_precision(opts, 5);

    sass_file_context_set_options(ctx, opts);

    int status = sass_compile_file_context(ctx);
    QString result;

    if (status == 0) {
        result = QString::fromUtf8(sass_context_get_output_string(
            sass_file_context_get_context(ctx)));
    } else {
        const char* err = sass_context_get_error_message(
            sass_file_context_get_context(ctx));
        qWarning() << "[StyleManager] SCSS compile error:" << err;
    }

    sass_delete_file_context(ctx);
    return result;
}

QStringList StyleManager::availableThemes() const {
    QStringList themes;

    if (!watchedDir_.isEmpty()) {
        themes += listThemesInDir(watchedDir_ + "/themes");
        themes += listThemesInDir(watchedDir_ + "/compiled");
        themes += listThemesInDir(watchedDir_);
    }

    themes += listThemesInDir(":/styles");

    themes.removeDuplicates();
    themes.sort();
    return themes;
}

QStringList StyleManager::availableBaseThemes() const {
    QSet<QString> bases;
    for (const auto& theme : availableThemes())
        bases.insert(stripModeSuffix(theme));

    QStringList result(bases.begin(), bases.end());
    result.sort();
    return result;
}

QStringList StyleManager::listThemesInDir(const QString& dir) const {
    QStringList themes;
    QDir d(dir);
    if (!d.exists()) return themes;

    for (const auto& entry : d.entryInfoList({"*.scss", "*.qss", "*.css"}, QDir::Files)) {
        themes.append(entry.baseName());
    }
    return themes;
}
