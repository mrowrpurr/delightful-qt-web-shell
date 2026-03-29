import { getBridge } from './bridge'

// TypeScript interface for the SystemBridge C++ bridge.
// Desktop capabilities: clipboard, file I/O, file drop, etc.

export interface SystemBridge {
  // ── Clipboard ──────────────────────────────────────────
  copyToClipboard(text: string): Promise<{ ok: boolean }>
  readClipboard(): Promise<{ text: string }>

  // ── File choosers ──────────────────────────────────────
  openFileChooser(filter?: string): Promise<{ path: string } | { cancelled: true }>
  openFolderChooser(): Promise<{ path: string } | { cancelled: true }>

  // ── Directory listing ──────────────────────────────────
  listFolder(path: string): Promise<{ entries: Array<{ name: string; isDir: boolean; size: number }> } | { error: string }>
  globFolder(path: string, pattern: string, recursive?: boolean): Promise<{ paths: string[] } | { error: string }>

  // ── Simple file reads/writes ──────────────────────────────
  readTextFile(path: string): Promise<{ text: string } | { error: string }>
  readFileBytes(path: string): Promise<{ data: string } | { error: string }> // base64
  writeTextFile(path: string, text: string): Promise<{ ok: boolean } | { error: string }>

  // ── File handles (streaming) ───────────────────────────
  // For large files: open a handle, read chunks, close when done.
  openFileHandle(path: string): Promise<{ handle: string; size: number } | { error: string }>
  readFileChunk(handle: string, offset: number, length: number): Promise<{ data: string; bytesRead: number } | { error: string }> // base64
  closeFileHandle(handle: string): Promise<{ ok: boolean } | { error: string }>

  // ── Args from CLI / URL protocol / other instance ───────
  getReceivedArgs(): Promise<string[]>
  argsReceived(callback: () => void): () => void

  // ── File drop ──────────────────────────────────────────
  getDroppedFiles(): Promise<string[]>
  filesDropped(callback: () => void): () => void

  // ── Qt theme control ──────────────────────────────────────
  setQtTheme(displayName: string, isDark: boolean): Promise<{ ok: boolean }>
  getQtTheme(): Promise<{ displayName: string; isDark: boolean }>
  getQtThemeFilePath(): Promise<{ path: string } | { embedded: boolean }>
  qtThemeChanged(callback: () => void): () => void

  // ── Save ──────────────────────────────────────────────────
  saveRequested(callback: () => void): () => void

  // ── Native dialogs ─────────────────────────────────────
  openDialog(): Promise<{ ok: boolean }>
  openDialogRequested(callback: () => void): () => void
}

export async function getSystemBridge(): Promise<SystemBridge> {
  return getBridge<SystemBridge>('system')
}
