// SystemBridge — desktop capabilities exposed to React.
//
// Clipboard, file I/O, file drop detection, and other OS-level features that
// web content can't access on its own. This bridge is registered as "system".

#pragma once

#include <QClipboard>
#include <QDir>
#include <QDirIterator>
#include <QFile>
#include <QFileDialog>
#include <QFileInfo>
#include <QGuiApplication>
#include <QJsonArray>
#include <QJsonObject>
#include <QMap>
#include <QObject>
#include <QString>
#include <QStringList>
#include <QUuid>

class SystemBridge : public QObject {
    Q_OBJECT

public:
    using QObject::QObject;

    // ── Clipboard ────────────────────────────────────────────

    // Copy text to the system clipboard.
    Q_INVOKABLE QJsonObject copyToClipboard(const QString& text) {
        QGuiApplication::clipboard()->setText(text);
        return {{"ok", true}};
    }

    // Read current clipboard text.
    Q_INVOKABLE QJsonObject readClipboard() {
        return {{"text", QGuiApplication::clipboard()->text()}};
    }

    // ── File choosers ────────────────────────────────────────
    // Native OS dialogs for picking files/folders.
    // Returns { path } on selection, { cancelled: true } if dismissed.

    // Open a native file picker. Pass a Qt filter string like
    // "Images (*.png *.jpg);;All Files (*)" or omit for all files.
    Q_INVOKABLE QJsonObject openFileChooser(const QString& filter = "") {
        // Emits signal so the UI layer can show the dialog on the right window.
        // But SystemBridge is headless — we use nullptr as parent.
        // If you need proper parenting, emit a signal like openDialog does.
        QString path = QFileDialog::getOpenFileName(nullptr, "Open File", "", filter);
        if (path.isEmpty())
            return {{"cancelled", true}};
        return {{"path", path}};
    }

    // Open a native folder picker.
    Q_INVOKABLE QJsonObject openFolderChooser() {
        QString path = QFileDialog::getExistingDirectory(
            nullptr, "Open Folder", "",
            QFileDialog::ShowDirsOnly | QFileDialog::DontResolveSymlinks);
        if (path.isEmpty())
            return {{"cancelled", true}};
        return {{"path", path}};
    }

    // ── Directory listing ────────────────────────────────────

    // List entries in a folder. Returns name, isDir, and size for each.
    Q_INVOKABLE QJsonObject listFolder(const QString& path) {
        QDir dir(path);
        if (!dir.exists())
            return {{"error", "Folder does not exist: " + path}};

        QJsonArray entries;
        for (const auto& info : dir.entryInfoList(QDir::AllEntries | QDir::NoDotAndDotDot)) {
            entries.append(QJsonObject{
                {"name", info.fileName()},
                {"isDir", info.isDir()},
                {"size", info.size()},
            });
        }
        return {{"entries", entries}};
    }

    // Glob a folder with a wildcard pattern. Returns matching paths.
    // Set recursive = true to search subdirectories.
    Q_INVOKABLE QJsonObject globFolder(const QString& path, const QString& pattern,
                                       bool recursive = false) {
        QDir dir(path);
        if (!dir.exists())
            return {{"error", "Folder does not exist: " + path}};

        QJsonArray matches;
        if (recursive) {
            QDirIterator it(path, {pattern}, QDir::Files, QDirIterator::Subdirectories);
            while (it.hasNext())
                matches.append(it.next());
        } else {
            for (const auto& info : dir.entryInfoList({pattern}, QDir::Files))
                matches.append(info.absoluteFilePath());
        }
        return {{"paths", matches}};
    }

    // ── Simple file reads ────────────────────────────────────
    // Convenience methods for small files. For large files, use handles below.

    // Read an entire file as a UTF-8 string. Great for config, JSON, text.
    // Don't use this on a 500MB log file — use openFileHandle + readFileChunk.
    Q_INVOKABLE QJsonObject readTextFile(const QString& path) {
        QFile file(path);
        if (!file.exists())
            return {{"error", "File does not exist: " + path}};
        if (!file.open(QIODevice::ReadOnly))
            return {{"error", "Cannot open file: " + path}};
        return {{"text", QString::fromUtf8(file.readAll())}};
    }

    // Read an entire file as base64. Works for binary (images, etc.).
    // Same caveat — don't use on huge files.
    Q_INVOKABLE QJsonObject readFileBytes(const QString& path) {
        QFile file(path);
        if (!file.exists())
            return {{"error", "File does not exist: " + path}};
        if (!file.open(QIODevice::ReadOnly))
            return {{"error", "Cannot open file: " + path}};
        return {{"data", QString::fromLatin1(file.readAll().toBase64())}};
    }

    // Write a UTF-8 string to a file. Creates the file if it doesn't exist.
    Q_INVOKABLE QJsonObject writeTextFile(const QString& path, const QString& text) {
        QFile file(path);
        // WriteOnly without Text flag — write bytes exactly as received.
        // Text flag converts \n to \r\n on Windows, which doubles line endings
        // when the input already contains \r\n (e.g. from Monaco editor).
        if (!file.open(QIODevice::WriteOnly))
            return {{"error", "Cannot write file: " + path}};
        file.write(text.toUtf8());
        return {{"ok", true}};
    }

    // ── File handles (streaming) ─────────────────────────────
    // For large files: open a handle on the C++ side, read chunks from JS.
    // The file stays open until you close the handle. No 1GB JSON payloads.

    // Open a file handle. Returns { handle, size }.
    Q_INVOKABLE QJsonObject openFileHandle(const QString& path) {
        auto* file = new QFile(path);
        if (!file->exists()) {
            delete file;
            return {{"error", "File does not exist: " + path}};
        }
        if (!file->open(QIODevice::ReadOnly)) {
            delete file;
            return {{"error", "Cannot open file: " + path}};
        }
        QString handle = QUuid::createUuid().toString(QUuid::WithoutBraces);
        openFiles_.insert(handle, file);
        return {{"handle", handle}, {"size", file->size()}};
    }

    // Read a chunk from an open file handle. Returns base64.
    // offset and length are in bytes.
    Q_INVOKABLE QJsonObject readFileChunk(const QString& handle,
                                          qint64 offset, qint64 length) {
        auto* file = openFiles_.value(handle);
        if (!file)
            return {{"error", "Invalid handle: " + handle}};
        if (!file->seek(offset))
            return {{"error", "Seek failed at offset " + QString::number(offset)}};
        QByteArray chunk = file->read(length);
        return {{"data", QString::fromLatin1(chunk.toBase64())}, {"bytesRead", chunk.size()}};
    }

    // Close a file handle and free resources.
    Q_INVOKABLE QJsonObject closeFileHandle(const QString& handle) {
        auto* file = openFiles_.take(handle);
        if (!file)
            return {{"error", "Invalid handle: " + handle}};
        file->close();
        delete file;
        return {{"ok", true}};
    }

    // ── File drop ────────────────────────────────────────────

    // Called by WebShellWidget when files are dropped onto the view.
    // Stores the paths and emits the parameterless signal so React can fetch them.
    void handleFilesDropped(const QStringList& paths) {
        droppedFiles_ = paths;
        emit filesDropped();
    }

    // Get the paths from the most recent drop.
    Q_INVOKABLE QJsonArray getDroppedFiles() {
        QJsonArray arr;
        for (const auto& path : droppedFiles_)
            arr.append(path);
        return arr;
    }

    // ── Args from CLI / URL protocol / other instance ──────

    // Called by main.cpp when args arrive (first launch or via single-instance pipe).
    void handleArgs(const QStringList& args) {
        receivedArgs_ = args;
        emit argsReceived();
    }

    // Get the args from the most recent instance launch.
    Q_INVOKABLE QJsonArray getReceivedArgs() {
        QJsonArray arr;
        for (const auto& arg : receivedArgs_)
            arr.append(arg);
        return arr;
    }

    // ── Qt theme control ────────────────────────────────────
    // React can change the Qt-side QSS theme and dark/light mode.
    // Changes emit qtThemeChanged so all subscribers stay in sync.

    // Set the Qt theme. displayName is the React-side theme name (e.g. "Mrowr Purr - Synthwave '84").
    // isDark selects the -dark or -light QSS variant.
    Q_INVOKABLE QJsonObject setQtTheme(const QString& displayName, bool isDark) {
        emit qtThemeRequested(displayName, isDark);
        return {{"ok", true}};
    }

    // Get the current Qt theme state.
    // Returns displayName (React-side name) and isDark.
    Q_INVOKABLE QJsonObject getQtTheme() {
        return {{"displayName", qtDisplayName_}, {"isDark", qtIsDark_}};
    }

    // Called by Application/StyleManager when the Qt theme changes.
    // Updates internal state and emits the parameterless signal.
    void updateQtThemeState(const QString& displayName, bool isDark) {
        qtDisplayName_ = displayName;
        qtIsDark_ = isDark;
        emit qtThemeChanged();
    }

    // Get the filesystem path of the current Qt theme file.
    // Returns { path } if a local file is being used, { embedded: true } if QRC.
    Q_INVOKABLE QJsonObject getQtThemeFilePath() {
        return qtThemeFilePath_;
    }

    // Called by Application when theme changes to update the file path info.
    void setQtThemeFilePath(const QJsonObject& info) {
        qtThemeFilePath_ = info;
    }

    // ── Native dialogs ─────────────────────────────────────

    // Request the Qt host to open a dialog. The bridge doesn't know about
    // UI classes — it just emits a signal. MainWindow connects to it and
    // opens the actual QDialog. This keeps the bridge decoupled from the UI.
    Q_INVOKABLE QJsonObject openDialog() {
        emit openDialogRequested();
        return {{"ok", true}};
    }

signals:
    // Emitted when the Qt QSS theme changes (from toolbar or bridge call).
    // Parameterless — React calls getQtTheme() to read the new state.
    void qtThemeChanged();

    // Internal: bridge requests theme change → Application wires this to StyleManager.
    // Not forwarded to WebSocket (has parameters).
    void qtThemeRequested(const QString& displayName, bool isDark);
    // Emitted when files are dropped onto the web view.
    // Parameterless so it auto-forwards over WebSocket/QWebChannel.
    // React subscribes, then calls getDroppedFiles() to get the paths.
    void filesDropped();

    // Emitted when args arrive from CLI, URL protocol, or another instance.
    // React subscribes, then calls getReceivedArgs().
    void argsReceived();

    // Emitted when the user triggers Save from Qt (toolbar/menu).
    // React can intercept this — if the theme editor is active, save the theme
    // instead of opening the file dialog.
    void saveRequested();

    // Emitted when React requests a native dialog (e.g. Quick Add).
    // Connect to this in MainWindow or wherever you want to handle it.
    void openDialogRequested();

private:
    QStringList droppedFiles_;
    QStringList receivedArgs_;
    QMap<QString, QFile*> openFiles_;  // handle ID → open QFile
    QString qtDisplayName_;            // current React display name (e.g. "Mrowr Purr - Synthwave '84")
    bool qtIsDark_ = true;             // current Qt dark/light state
    QJsonObject qtThemeFilePath_;      // { "path": "..." } or { "embedded": true }
};
