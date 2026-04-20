// SystemBridge — desktop capabilities exposed to React.
// Pure def_type interface. Qt used internally for file I/O, clipboard, dialogs.

#pragma once

#include <QClipboard>
#include <QDir>
#include <QDirIterator>
#include <QFile>
#include <QFileDialog>
#include <QFileInfo>
#include <QGuiApplication>
#include <QMap>
#include <QString>
#include <QStringList>
#include <QUuid>

#include "system_dtos.hpp"
#include "typed_bridge.hpp"

class SystemBridge : public web_shell::typed_bridge {
    QStringList droppedFiles_;
    QStringList receivedArgs_;
    QMap<QString, QFile*> openFiles_;
    std::string qtDisplayName_;
    bool qtIsDark_ = true;
    std::string qtThemeFilePath_;
    bool qtThemeEmbedded_ = false;

public:
    SystemBridge() {
        method("copyToClipboard",  &SystemBridge::copyToClipboard);
        method("readClipboard",    &SystemBridge::readClipboard);
        method("openFileChooser",  &SystemBridge::openFileChooser);
        method("openFolderChooser",&SystemBridge::openFolderChooser);
        method("listFolder",       &SystemBridge::listFolder);
        method("globFolder",       &SystemBridge::globFolder);
        method("readTextFile",     &SystemBridge::readTextFile);
        method("readFileBytes",    &SystemBridge::readFileBytes);
        method("writeTextFile",    &SystemBridge::writeTextFile);
        method("openFileHandle",   &SystemBridge::openFileHandle);
        method("readFileChunk",    &SystemBridge::readFileChunk);
        method("closeFileHandle",  &SystemBridge::closeFileHandle);
        method("getDroppedFiles",  &SystemBridge::getDroppedFiles);
        method("getReceivedArgs",  &SystemBridge::getReceivedArgs);
        method("setQtTheme",       &SystemBridge::setQtTheme);
        method("getQtTheme",       &SystemBridge::getQtTheme);
        method("getQtThemeFilePath", &SystemBridge::getQtThemeFilePath);
        method("openDialog",       &SystemBridge::openDialog);

        signal("qtThemeChanged");
        signal("qtThemeRequested");
        signal("filesDropped");
        signal("argsReceived");
        signal("saveRequested");
        signal("openDialogRequested");
    }

    // ── Clipboard ────────────────────────────────────────────

    OkResponse copyToClipboard(CopyToClipboardRequest req) {
        QGuiApplication::clipboard()->setText(QString::fromStdString(req.text));
        return {};
    }

    ReadClipboardResponse readClipboard() const {
        ReadClipboardResponse resp;
        resp.text = QGuiApplication::clipboard()->text().toStdString();
        return resp;
    }

    // ── File choosers ────────────────────────────────────────

    FileChooserResponse openFileChooser(OpenFileChooserRequest req) {
        QString path = QFileDialog::getOpenFileName(
            nullptr, "Open File", "", QString::fromStdString(req.filter));
        FileChooserResponse resp;
        if (path.isEmpty()) {
            resp.cancelled = true;
        } else {
            resp.path = path.toStdString();
        }
        return resp;
    }

    FileChooserResponse openFolderChooser() {
        QString path = QFileDialog::getExistingDirectory(
            nullptr, "Open Folder", "",
            QFileDialog::ShowDirsOnly | QFileDialog::DontResolveSymlinks);
        FileChooserResponse resp;
        if (path.isEmpty()) {
            resp.cancelled = true;
        } else {
            resp.path = path.toStdString();
        }
        return resp;
    }

    // ── Directory listing ────────────────────────────────────

    nlohmann::json listFolder(ListFolderRequest req) const {
        QDir dir(QString::fromStdString(req.path));
        if (!dir.exists())
            throw std::runtime_error("Folder does not exist: " + std::string(req.path));

        auto entries = nlohmann::json::array();
        for (const auto& info : dir.entryInfoList(QDir::AllEntries | QDir::NoDotAndDotDot)) {
            entries.push_back({
                {"name", info.fileName().toStdString()},
                {"isDir", info.isDir()},
                {"size", info.size()},
            });
        }
        return {{"entries", entries}};
    }

    nlohmann::json globFolder(GlobFolderRequest req) const {
        QDir dir(QString::fromStdString(req.path));
        if (!dir.exists())
            throw std::runtime_error("Folder does not exist: " + std::string(req.path));

        auto matches = nlohmann::json::array();
        auto qPattern = QString::fromStdString(req.pattern);
        if (req.pattern.value.empty()) qPattern = "*";

        if (req.recursive) {
            QDirIterator it(QString::fromStdString(req.path), {qPattern},
                           QDir::Files, QDirIterator::Subdirectories);
            while (it.hasNext())
                matches.push_back(it.next().toStdString());
        } else {
            for (const auto& info : dir.entryInfoList({qPattern}, QDir::Files))
                matches.push_back(info.absoluteFilePath().toStdString());
        }
        return {{"paths", matches}};
    }

    // ── File I/O ─────────────────────────────────────────────

    ReadTextFileResponse readTextFile(ReadTextFileRequest req) {
        QFile file(QString::fromStdString(req.path));
        if (!file.exists())
            throw std::runtime_error("File does not exist: " + std::string(req.path));
        if (!file.open(QIODevice::ReadOnly))
            throw std::runtime_error("Cannot open file: " + std::string(req.path));
        ReadTextFileResponse resp;
        resp.text = QString::fromUtf8(file.readAll()).toStdString();
        return resp;
    }

    ReadFileBytesResponse readFileBytes(ReadFileBytesRequest req) {
        QFile file(QString::fromStdString(req.path));
        if (!file.exists())
            throw std::runtime_error("File does not exist: " + std::string(req.path));
        if (!file.open(QIODevice::ReadOnly))
            throw std::runtime_error("Cannot open file: " + std::string(req.path));
        ReadFileBytesResponse resp;
        resp.data = file.readAll().toBase64().toStdString();
        return resp;
    }

    OkResponse writeTextFile(WriteTextFileRequest req) {
        QFile file(QString::fromStdString(req.path));
        if (!file.open(QIODevice::WriteOnly))
            throw std::runtime_error("Cannot write file: " + std::string(req.path));
        file.write(QByteArray::fromStdString(std::string(req.text)));
        return {};
    }

    // ── File handles (streaming) ─────────────────────────────

    OpenFileHandleResponse openFileHandle(OpenFileHandleRequest req) {
        auto* file = new QFile(QString::fromStdString(req.path));
        if (!file->exists()) { delete file; throw std::runtime_error("File does not exist: " + std::string(req.path)); }
        if (!file->open(QIODevice::ReadOnly)) { delete file; throw std::runtime_error("Cannot open file: " + std::string(req.path)); }
        QString handle = QUuid::createUuid().toString(QUuid::WithoutBraces);
        openFiles_.insert(handle, file);
        OpenFileHandleResponse resp;
        resp.handle = handle.toStdString();
        resp.size = file->size();
        return resp;
    }

    ReadFileChunkResponse readFileChunk(ReadFileChunkRequest req) {
        auto* file = openFiles_.value(QString::fromStdString(req.handle));
        if (!file) throw std::runtime_error("Invalid handle: " + std::string(req.handle));
        if (!file->seek(req.offset)) throw std::runtime_error("Seek failed");
        QByteArray chunk = file->read(req.length);
        ReadFileChunkResponse resp;
        resp.data = chunk.toBase64().toStdString();
        resp.bytesRead = chunk.size();
        return resp;
    }

    OkResponse closeFileHandle(CloseFileHandleRequest req) {
        auto* file = openFiles_.take(QString::fromStdString(req.handle));
        if (!file) throw std::runtime_error("Invalid handle: " + std::string(req.handle));
        file->close();
        delete file;
        return {};
    }

    // ── File drop (called by C++ side, emits to React) ───────

    void handleFilesDropped(const QStringList& paths) {
        droppedFiles_ = paths;
        nlohmann::json pathsJson = nlohmann::json::array();
        for (const auto& p : paths)
            pathsJson.push_back(p.toStdString());
        emit_signal("filesDropped", pathsJson);
    }

    nlohmann::json getDroppedFiles() const {
        auto arr = nlohmann::json::array();
        for (const auto& p : droppedFiles_)
            arr.push_back(p.toStdString());
        return arr;
    }

    // ── CLI args (called by C++ side, emits to React) ────────

    void handleArgs(const QStringList& args) {
        receivedArgs_ = args;
        nlohmann::json argsJson = nlohmann::json::array();
        for (const auto& a : args)
            argsJson.push_back(a.toStdString());
        emit_signal("argsReceived", argsJson);
    }

    nlohmann::json getReceivedArgs() const {
        auto arr = nlohmann::json::array();
        for (const auto& a : receivedArgs_)
            arr.push_back(a.toStdString());
        return arr;
    }

    // ── Theme control ────────────────────────────────────────

    OkResponse setQtTheme(SetQtThemeRequest req) {
        nlohmann::json payload = {{"displayName", req.displayName.value}, {"isDark", req.isDark.value}};
        emit_signal("qtThemeRequested", payload);
        return {};
    }

    GetQtThemeResponse getQtTheme() const {
        GetQtThemeResponse resp;
        resp.displayName = qtDisplayName_;
        resp.isDark = qtIsDark_;
        return resp;
    }

    // Called by Application when Qt theme changes.
    void updateQtThemeState(const QString& displayName, bool isDark) {
        qtDisplayName_ = displayName.toStdString();
        qtIsDark_ = isDark;
        nlohmann::json payload = {{"displayName", qtDisplayName_}, {"isDark", qtIsDark_}};
        emit_signal("qtThemeChanged", payload);
    }

    GetQtThemeFilePathResponse getQtThemeFilePath() const {
        GetQtThemeFilePathResponse resp;
        resp.path = qtThemeFilePath_;
        resp.embedded = qtThemeEmbedded_;
        return resp;
    }

    void setQtThemeFilePath(const std::string& path, bool embedded) {
        qtThemeFilePath_ = path;
        qtThemeEmbedded_ = embedded;
    }

    // ── Native dialogs ───────────────────────────────────────

    OkResponse openDialog() {
        emit_signal("openDialogRequested");
        return {};
    }

    // ── Save ─────────────────────────────────────────────────

    void emitSaveRequested() {
        emit_signal("saveRequested");
    }
};
