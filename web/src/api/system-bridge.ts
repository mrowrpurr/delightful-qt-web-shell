import { getBridge } from './bridge'

// TypeScript interface for the SystemBridge C++ bridge.
// Desktop capabilities: clipboard, file drop, etc.

export interface SystemBridge {
  copyToClipboard(text: string): Promise<{ ok: boolean }>
  readClipboard(): Promise<{ text: string }>
  getDroppedFiles(): Promise<string[]>
  filesDropped(callback: () => void): () => void
}

export async function getSystemBridge(): Promise<SystemBridge> {
  return getBridge<SystemBridge>('system')
}
