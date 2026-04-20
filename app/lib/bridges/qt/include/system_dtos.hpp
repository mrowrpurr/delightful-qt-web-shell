// Request/response DTOs for SystemBridge methods.

#pragma once

#include <def_type.hpp>

using def_type::field;

// ── Clipboard ────────────────────────────────────────────
struct CopyToClipboardRequest   { field<std::string> text; };
struct ReadClipboardResponse    { field<std::string> text; };

// ── File choosers ────────────────────────────────────────
struct OpenFileChooserRequest   { field<std::string> filter; };
struct OpenFolderChooserRequest {};
struct FileChooserResponse      { field<std::string> path; field<bool> cancelled{.value = false}; };

// ── Directory listing ────────────────────────────────────
struct ListFolderRequest        { field<std::string> path; };
struct GlobFolderRequest        { field<std::string> path; field<std::string> pattern; field<bool> recursive{.value = false}; };

// ── File I/O ─────────────────────────────────────────────
struct ReadTextFileRequest      { field<std::string> path; };
struct ReadTextFileResponse     { field<std::string> text; };
struct ReadFileBytesRequest     { field<std::string> path; };
struct ReadFileBytesResponse    { field<std::string> data; };
struct WriteTextFileRequest     { field<std::string> path; field<std::string> text; };

// ── File handles (streaming) ─────────────────────────────
struct OpenFileHandleRequest    { field<std::string> path; };
struct OpenFileHandleResponse   { field<std::string> handle; field<int64_t> size; };
struct ReadFileChunkRequest     { field<std::string> handle; field<int64_t> offset; field<int64_t> length; };
struct ReadFileChunkResponse    { field<std::string> data; field<int64_t> bytesRead; };
struct CloseFileHandleRequest   { field<std::string> handle; };

// ── Theme control ────────────────────────────────────────
struct SetQtThemeRequest        { field<std::string> displayName; field<bool> isDark; };
struct GetQtThemeResponse       { field<std::string> displayName; field<bool> isDark; };
struct GetQtThemeFilePathResponse { field<std::string> path; field<bool> embedded{.value = false}; };
