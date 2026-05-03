import { getBridge } from '../transport/bridge'

// TypeScript interface for the SystemBridge C++ bridge.
// Desktop capabilities: clipboard, file I/O, file drop, etc.
// All methods use request objects (def_type DTOs on the C++ side).

export interface SystemBridge {
  // ── Clipboard ──────────────────────────────────────────
  copyToClipboard(req: { text: string }): Promise<{ ok: boolean }>
  readClipboard(): Promise<{ text: string }>

  // ── File choosers ──────────────────────────────────────
  openFileChooser(req: { filter: string }): Promise<{ path: string; cancelled: boolean }>
  openFolderChooser(): Promise<{ path: string; cancelled: boolean }>

  // ── Directory listing ──────────────────────────────────
  listFolder(req: { path: string }): Promise<{ entries: Array<{ name: string; isDir: boolean; size: number }> }>
  globFolder(req: { path: string; pattern: string; recursive: boolean }): Promise<{ paths: string[] }>

  // ── Simple file reads/writes ──────────────────────────────
  readTextFile(req: { path: string }): Promise<{ text: string }>
  readFileBytes(req: { path: string }): Promise<{ data: string }>
  writeTextFile(req: { path: string; text: string }): Promise<{ ok: boolean }>

  // ── File handles (streaming) ───────────────────────────
  openFileHandle(req: { path: string }): Promise<{ handle: string; size: number }>
  readFileChunk(req: { handle: string; offset: number; length: number }): Promise<{ data: string; bytesRead: number }>
  closeFileHandle(req: { handle: string }): Promise<{ ok: boolean }>

  // ── Args from CLI / URL protocol / other instance ───────
  getAppLaunchArgs(): Promise<{ items: string[] }>
  appLaunchArgsReceived(callback: (data: { items: string[] }) => void): () => void

  // ── File drop ──────────────────────────────────────────
  getDroppedFiles(): Promise<string[]>
  filesDropped(callback: (data?: any) => void): () => void

  // ── Qt theme control ──────────────────────────────────────
  setQtTheme(req: { displayName: string; isDark: boolean }): Promise<{ ok: boolean }>
  getQtTheme(): Promise<{ displayName: string; isDark: boolean }>
  getQtThemeFilePath(): Promise<{ path: string; embedded: boolean }>
  qtThemeChanged(callback: (data?: any) => void): () => void

  // ── Save ──────────────────────────────────────────────────
  saveRequested(callback: () => void): () => void

  // ── Native dialogs ─────────────────────────────────────
  openDialog(): Promise<{ ok: boolean }>
  openDialogRequested(callback: () => void): () => void
}

export async function getSystemBridge(): Promise<SystemBridge> {
  return getBridge<SystemBridge>('system')
}
