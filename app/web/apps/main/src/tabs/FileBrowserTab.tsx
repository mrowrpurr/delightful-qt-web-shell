import { useState, useCallback } from 'react'
import { getBridge } from '@shared/api/bridge'
import type { SystemBridge } from '@shared/api/system-bridge'
import { Button } from '@shared/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@shared/components/ui/card'

const system = await getBridge<SystemBridge>('system')

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const imageExts = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'svg'])

export default function FileBrowserTab() {
  const [browseFolder, setBrowseFolder] = useState<string | null>(null)
  const [browseEntries, setBrowseEntries] = useState<Array<{ name: string; isDir: boolean; size: number }>>([])
  const [filePreview, setFilePreview] = useState<{ name: string; text: string; method: string } | null>(null)
  const [imagePreview, setImagePreview] = useState<{ name: string; dataUrl: string } | null>(null)
  const [globPattern, setGlobPattern] = useState('')
  const [globResults, setGlobResults] = useState<string[] | null>(null)

  const clearPreviews = useCallback(() => {
    setFilePreview(null)
    setImagePreview(null)
  }, [])

  const handleBrowseFolder = useCallback(async () => {
    const result = await system.openFolderChooser()
    if (result.cancelled) return
    setBrowseFolder(result.path)
    clearPreviews()
    setGlobResults(null)
    setGlobPattern('')
    const listing = await system.listFolder({ path: result.path })
    setBrowseEntries(listing.entries)
  }, [clearPreviews])

  const handleOpenFile = useCallback(async () => {
    const result = await system.openFileChooser({ filter: '' })
    if (result.cancelled) return
    const read = await system.readTextFile({ path: result.path })
    const fileName = result.path.split(/[/\\]/).pop() || result.path
    clearPreviews()
    const preview = read.text.length > 4000
      ? read.text.slice(0, 4000) + `\n\n… truncated (${formatSize(read.text.length)})`
      : read.text
    setFilePreview({ name: fileName, text: preview, method: 'readTextFile' })
  }, [clearPreviews])

  const handleBrowseEntry = useCallback(async (name: string, isDir: boolean, size: number) => {
    if (!browseFolder) return
    const fullPath = browseFolder + '/' + name
    if (isDir) {
      setBrowseFolder(fullPath)
      clearPreviews()
      setGlobResults(null)
      setGlobPattern('')
      const listing = await system.listFolder({ path: fullPath })
      setBrowseEntries(listing.entries)
      return
    }

    const ext = name.split('.').pop()?.toLowerCase() || ''

    if (imageExts.has(ext) && size < 10 * 1024 * 1024) {
      const result = await system.readFileBytes({ path: fullPath })
      clearPreviews()
      const mime = ext === 'svg' ? 'image/svg+xml' : `image/${ext === 'jpg' ? 'jpeg' : ext}`
      setImagePreview({ name, dataUrl: `data:${mime};base64,${result.data}` })
      return
    }

    if (size < 100 * 1024) {
      const result = await system.readTextFile({ path: fullPath })
      clearPreviews()
      setFilePreview({ name, text: result.text, method: 'readTextFile' })
      return
    }

    const handle = await system.openFileHandle({ path: fullPath })
    clearPreviews()
    const sizeLabel = formatSize(handle.size)
    const chunk = await system.readFileChunk({ handle: handle.handle, offset: 0, length: 4096 })
    await system.closeFileHandle({ handle: handle.handle })
    const text = atob(chunk.data)
    setFilePreview({
      name,
      text: text + `\n\n… showing 4 KB of ${sizeLabel} (streamed via file handle)`,
      method: 'openFileHandle → readFileChunk → closeFileHandle',
    })
  }, [browseFolder, clearPreviews])

  const handleBrowseUp = useCallback(async () => {
    if (!browseFolder) return
    const parent = browseFolder.replace(/[/\\][^/\\]+$/, '')
    if (parent === browseFolder) return
    setBrowseFolder(parent)
    clearPreviews()
    setGlobResults(null)
    setGlobPattern('')
    const listing = await system.listFolder({ path: parent })
    setBrowseEntries(listing.entries)
  }, [browseFolder, clearPreviews])

  const handleGlob = useCallback(async () => {
    if (!browseFolder || !globPattern.trim()) return
    const result = await system.globFolder({ path: browseFolder, pattern: globPattern.trim(), recursive: true })
    setGlobResults(result.paths)
  }, [browseFolder, globPattern])

  return (
    <div className="max-w-2xl mx-auto p-6 flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-primary mb-1">File Browser</h2>
        <p className="text-sm text-muted-foreground">
          File I/O demo — three tiers: <code className="text-xs bg-muted px-1 rounded">readTextFile</code> for small files,{' '}
          <code className="text-xs bg-muted px-1 rounded">readFileBytes</code> for images,{' '}
          <code className="text-xs bg-muted px-1 rounded">openFileHandle</code> for streaming large files.
        </p>
      </div>

      <div className="flex gap-2">
        <Button data-testid="browse-folder-button" onClick={handleBrowseFolder}>📂 Browse Folder</Button>
        <Button variant="outline" data-testid="open-file-button" onClick={handleOpenFile}>📄 Open File</Button>
      </div>

      {browseFolder && (
        <>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Button variant="ghost" size="icon" onClick={handleBrowseUp} title="Go up">⬆</Button>
            <span className="break-all">{browseFolder}</span>
          </div>

          <div className="flex gap-2">
            <input
              className="flex-1 h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="Glob pattern (e.g. *.tsx)"
              value={globPattern}
              onChange={e => setGlobPattern(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleGlob()}
            />
            <Button variant="secondary" onClick={handleGlob}>🔍 Glob</Button>
          </div>

          {globResults && (
            <Card>
              <CardHeader className="py-2 px-3 flex-row items-center justify-between">
                <CardTitle className="text-sm text-primary">
                  {globResults.length} match{globResults.length !== 1 ? 'es' : ''}
                </CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setGlobResults(null)}>✕</Button>
              </CardHeader>
              <CardContent className="p-0 max-h-48 overflow-y-auto">
                {globResults.map((path, i) => (
                  <div key={i} className="px-3 py-1 text-xs font-mono text-muted-foreground break-all">{path}</div>
                ))}
              </CardContent>
            </Card>
          )}

          <div className="border border-border rounded-lg max-h-60 overflow-y-auto">
            {browseEntries.map(entry => (
              <div
                key={entry.name}
                className={`flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-accent/30 transition-colors ${entry.isDir ? 'font-medium' : ''}`}
                onClick={() => handleBrowseEntry(entry.name, entry.isDir, entry.size)}
              >
                <span>{entry.isDir ? '📁' : '📄'}</span>
                <span className="flex-1 truncate">{entry.name}</span>
                {!entry.isDir && <span className="text-xs text-muted-foreground">{formatSize(entry.size)}</span>}
              </div>
            ))}
          </div>
        </>
      )}

      {imagePreview && (
        <Card>
          <CardHeader className="py-2 px-3 flex-row items-center justify-between">
            <CardTitle className="text-sm">{imagePreview.name}</CardTitle>
            <span className="text-xs font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">readFileBytes</span>
          </CardHeader>
          <CardContent className="text-center">
            <img src={imagePreview.dataUrl} alt={imagePreview.name} className="max-w-full max-h-72 rounded inline-block" />
          </CardContent>
        </Card>
      )}

      {filePreview && (
        <Card>
          <CardHeader className="py-2 px-3 flex-row items-center justify-between">
            <CardTitle className="text-sm">{filePreview.name}</CardTitle>
            <span className="text-xs font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">{filePreview.method}</span>
          </CardHeader>
          <CardContent className="p-0">
            <pre className="p-3 text-xs font-mono text-muted-foreground max-h-72 overflow-auto whitespace-pre-wrap break-all">{filePreview.text}</pre>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
