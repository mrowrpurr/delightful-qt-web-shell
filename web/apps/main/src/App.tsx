import { useEffect, useState, useCallback } from 'react'
import { getBridge, signalReady, type TodoBridge, type TodoList, type TodoItem, type ListDetail } from '@shared/api/bridge'
import type { SystemBridge } from '@shared/api/system-bridge'

// Top-level await — Vite supports this natively.
// Runs before React mounts. The Qt shell shows a loading overlay during this time,
// so there's no visible delay. Safe to move but must stay at module scope (not
// inside a component), because getBridge returns a long-lived proxy, not per-render state.
const todos = await getBridge<TodoBridge>('todos')
const system = await getBridge<SystemBridge>('system')

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function App() {
  const [lists, setLists] = useState<TodoList[]>([])
  const [selectedListId, setSelectedListId] = useState<string | null>(null)
  const [detail, setDetail] = useState<ListDetail | null>(null)
  const [newListName, setNewListName] = useState('')
  const [newItemText, setNewItemText] = useState('')
  const [droppedFiles, setDroppedFiles] = useState<string[]>([])
  const [copyFeedback, setCopyFeedback] = useState('')
  const [browseFolder, setBrowseFolder] = useState<string | null>(null)
  const [browseEntries, setBrowseEntries] = useState<Array<{ name: string; isDir: boolean; size: number }>>([])
  const [filePreview, setFilePreview] = useState<{ name: string; text: string; method: string } | null>(null)
  const [imagePreview, setImagePreview] = useState<{ name: string; dataUrl: string } | null>(null)
  const [globPattern, setGlobPattern] = useState('')
  const [globResults, setGlobResults] = useState<string[] | null>(null)
  const [receivedArgs, setReceivedArgs] = useState<string[]>([])

  const loadLists = useCallback(async () => {
    const result = await todos.listLists()
    setLists(result)
  }, [])

  const loadDetail = useCallback(async (listId: string) => {
    const result = await todos.getList(listId)
    setDetail(result)
  }, [])

  // signalReady() tells Qt that React has mounted, which fades out the
  // loading overlay. Must run once after first render. Safe to move during
  // refactoring — just don't delete it. Without this call, the overlay
  // stays up for 15 seconds before showing an error message.
  useEffect(() => { signalReady() }, [])

  useEffect(() => {
    loadLists()
    return todos.dataChanged(() => {
      loadLists()
      if (selectedListId) loadDetail(selectedListId)
    })
  }, [loadLists, loadDetail, selectedListId])

  const selectList = useCallback((listId: string) => {
    setSelectedListId(listId)
    loadDetail(listId)
  }, [loadDetail])

  const handleCreateList = useCallback(async () => {
    const name = newListName.trim()
    if (!name) return
    await todos.addList(name).catch(console.error)
    setNewListName('')
  }, [newListName])

  const handleAddItem = useCallback(async () => {
    const text = newItemText.trim()
    if (!text || !selectedListId) return
    await todos.addItem(selectedListId, text).catch(console.error)
    setNewItemText('')
  }, [newItemText, selectedListId])

  const handleToggleItem = useCallback(async (itemId: string) => {
    if (!selectedListId) return
    await todos.toggleItem(itemId).catch(console.error)
  }, [selectedListId])

  const handleDeleteList = useCallback(async (listId: string) => {
    await todos.deleteList(listId).catch(console.error)
    if (selectedListId === listId) {
      setSelectedListId(null)
      setDetail(null)
    }
  }, [selectedListId])

  const handleDeleteItem = useCallback(async (itemId: string) => {
    await todos.deleteItem(itemId).catch(console.error)
  }, [])

  const handleCopyToClipboard = useCallback(async () => {
    const now = new Date().toLocaleString()
    await system.copyToClipboard(`[Clipboard Test] The current time is now ${now}`)
    setCopyFeedback('Copied!')
    setTimeout(() => setCopyFeedback(''), 2000)
  }, [])

  const clearPreviews = useCallback(() => {
    setFilePreview(null)
    setImagePreview(null)
  }, [])

  const handleBrowseFolder = useCallback(async () => {
    const result = await system.openFolderChooser()
    if ('cancelled' in result) return
    setBrowseFolder(result.path)
    clearPreviews()
    setGlobResults(null)
    setGlobPattern('')
    const listing = await system.listFolder(result.path)
    if ('error' in listing) return
    setBrowseEntries(listing.entries)
  }, [clearPreviews])

  const handleOpenFile = useCallback(async () => {
    const result = await system.openFileChooser()
    if ('cancelled' in result) return
    // Preview the chosen file using readTextFile (simple API demo)
    const read = await system.readTextFile(result.path)
    const fileName = result.path.split(/[/\\]/).pop() || result.path
    clearPreviews()
    if ('error' in read) {
      setFilePreview({ name: fileName, text: `⚠️ ${read.error}`, method: 'readTextFile' })
    } else {
      const preview = read.text.length > 4000
        ? read.text.slice(0, 4000) + `\n\n… truncated (${formatSize(read.text.length)})`
        : read.text
      setFilePreview({ name: fileName, text: preview, method: 'readTextFile' })
    }
  }, [clearPreviews])

  const imageExts = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'svg'])

  const handleBrowseEntry = useCallback(async (name: string, isDir: boolean, size: number) => {
    if (!browseFolder) return
    const fullPath = browseFolder + '/' + name
    if (isDir) {
      setBrowseFolder(fullPath)
      clearPreviews()
      setGlobResults(null)
      setGlobPattern('')
      const listing = await system.listFolder(fullPath)
      if ('error' in listing) return
      setBrowseEntries(listing.entries)
      return
    }

    const ext = name.split('.').pop()?.toLowerCase() || ''

    // Images → readFileBytes, render inline (demo of binary read)
    if (imageExts.has(ext) && size < 10 * 1024 * 1024) {
      const result = await system.readFileBytes(fullPath)
      clearPreviews()
      if ('error' in result) {
        setFilePreview({ name, text: `⚠️ ${result.error}`, method: 'readFileBytes' })
      } else {
        const mime = ext === 'svg' ? 'image/svg+xml' : `image/${ext === 'jpg' ? 'jpeg' : ext}`
        setImagePreview({ name, dataUrl: `data:${mime};base64,${result.data}` })
      }
      return
    }

    // Small text files (< 100KB) → readTextFile (simple API)
    if (size < 100 * 1024) {
      const result = await system.readTextFile(fullPath)
      clearPreviews()
      if ('error' in result) {
        setFilePreview({ name, text: `⚠️ ${result.error}`, method: 'readTextFile' })
      } else {
        setFilePreview({ name, text: result.text, method: 'readTextFile' })
      }
      return
    }

    // Large files → streaming via file handle (safe for any size)
    const handle = await system.openFileHandle(fullPath)
    clearPreviews()
    if ('error' in handle) {
      setFilePreview({ name, text: `⚠️ ${handle.error}`, method: 'openFileHandle' })
      return
    }
    const sizeLabel = formatSize(handle.size)
    const chunk = await system.readFileChunk(handle.handle, 0, 4096)
    await system.closeFileHandle(handle.handle)
    if ('error' in chunk) {
      setFilePreview({ name, text: `⚠️ ${chunk.error}`, method: 'readFileChunk' })
      return
    }
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
    const listing = await system.listFolder(parent)
    if ('error' in listing) return
    setBrowseEntries(listing.entries)
  }, [browseFolder, clearPreviews])

  const handleGlob = useCallback(async () => {
    if (!browseFolder || !globPattern.trim()) return
    const result = await system.globFolder(browseFolder, globPattern.trim(), true)
    if ('error' in result) return
    setGlobResults(result.paths)
  }, [browseFolder, globPattern])

  // Subscribe to file drop events from Qt
  useEffect(() => {
    return system.filesDropped(async () => {
      const files = await system.getDroppedFiles()
      setDroppedFiles(files)
    })
  }, [])

  // Subscribe to args from CLI / other instances
  useEffect(() => {
    // Check for args on first mount (primary instance's own args)
    system.getReceivedArgs().then(args => {
      if (args.length > 0) setReceivedArgs(args)
    })
    return system.argsReceived(async () => {
      const args = await system.getReceivedArgs()
      setReceivedArgs(args)
    })
  }, [])

  return (
    <div className="app">
      <h1 data-testid="heading">{import.meta.env.VITE_APP_NAME}</h1>
      <p>A template for Qt + React apps with real testing.</p>

      <div className="system-actions">
        <button data-testid="copy-clipboard-button" onClick={handleCopyToClipboard}>
          📋 Copy to clipboard
        </button>
        <button data-testid="open-dialog-button" onClick={() => system.openDialog()}>
          🗂️ Quick Add
        </button>
        {copyFeedback && <span className="feedback">{copyFeedback}</span>}
      </div>

      {receivedArgs.length > 0 && (
        <div className="dropped-files" data-testid="received-args">
          <strong>Args from CLI:</strong>
          {receivedArgs.map((arg, i) => (
            <div key={i} className="dropped-file">{arg}</div>
          ))}
        </div>
      )}

      {droppedFiles.length > 0 && (
        <div className="dropped-files" data-testid="dropped-files">
          <strong>Dropped files:</strong>
          {droppedFiles.map((file, i) => (
            <div key={i} className="dropped-file">{file}</div>
          ))}
        </div>
      )}

      <div className="file-browser">
        <div className="file-browser-actions">
          <button data-testid="browse-folder-button" onClick={handleBrowseFolder}>
            📂 Browse Folder
          </button>
          <button data-testid="open-file-button" onClick={handleOpenFile}>
            📄 Open File
          </button>
        </div>
        {browseFolder && (
          <>
            <div className="browse-path">
              <button className="browse-up-btn" onClick={handleBrowseUp} title="Go up">⬆</button>
              <span>{browseFolder}</span>
            </div>
            <div className="glob-search">
              <input
                placeholder="Glob pattern (e.g. *.tsx)"
                value={globPattern}
                onChange={e => setGlobPattern(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleGlob()}
              />
              <button onClick={handleGlob}>🔍 Glob</button>
            </div>
            {globResults && (
              <div className="glob-results">
                <div className="glob-results-header">
                  {globResults.length} match{globResults.length !== 1 ? 'es' : ''} for "{globPattern}"
                  <button className="glob-clear-btn" onClick={() => setGlobResults(null)}>✕</button>
                </div>
                {globResults.map((path, i) => (
                  <div key={i} className="glob-result">{path}</div>
                ))}
              </div>
            )}
            <div className="browse-entries">
              {browseEntries.map(entry => (
                <div
                  key={entry.name}
                  className={`browse-entry ${entry.isDir ? 'is-dir' : ''}`}
                  onClick={() => handleBrowseEntry(entry.name, entry.isDir, entry.size)}
                >
                  <span className="entry-icon">{entry.isDir ? '📁' : '📄'}</span>
                  <span className="entry-name">{entry.name}</span>
                  {!entry.isDir && <span className="entry-size">{formatSize(entry.size)}</span>}
                </div>
              ))}
            </div>
          </>
        )}
        {imagePreview && (
          <div className="file-preview">
            <div className="preview-header">
              {imagePreview.name}
              <span className="preview-method">readFileBytes</span>
            </div>
            <div className="preview-image">
              <img src={imagePreview.dataUrl} alt={imagePreview.name} />
            </div>
          </div>
        )}
        {filePreview && (
          <div className="file-preview">
            <div className="preview-header">
              {filePreview.name}
              <span className="preview-method">{filePreview.method}</span>
            </div>
            <pre className="preview-content">{filePreview.text}</pre>
          </div>
        )}
      </div>

      <div className="create-list">
        <input
          data-testid="new-list-input"
          placeholder="New list name"
          value={newListName}
          onChange={e => setNewListName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleCreateList()}
        />
        <button data-testid="create-list-button" onClick={handleCreateList}>
          Create
        </button>
      </div>

      {lists.length === 0 && (
        <p data-testid="empty-state" className="hint">No lists yet. Create one above.</p>
      )}

      <div className="lists">
        {lists.map(list => (
          <div
            key={list.id}
            data-testid="todo-list"
            className={`list-card ${list.id === selectedListId ? 'selected' : ''}`}
            onClick={() => selectList(list.id)}
          >
            <span className="list-name">{list.name}</span>
            <span className="list-count">{list.item_count}</span>
            <button
              data-testid="delete-list-button"
              className="delete-btn"
              onClick={e => { e.stopPropagation(); handleDeleteList(list.id) }}
              aria-label={`Delete ${list.name}`}
              title="Delete list"
            >×</button>
          </div>
        ))}
      </div>

      {detail && (
        <div className="detail" data-testid="list-detail">
          <h2>{detail.list.name}</h2>

          <div className="add-item">
            <input
              data-testid="new-item-input"
              placeholder="Add todo"
              value={newItemText}
              onChange={e => setNewItemText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddItem()}
            />
            <button data-testid="add-item-button" onClick={handleAddItem}>
              Add
            </button>
          </div>

          {detail.items.length === 0 && (
            <p className="hint">No items yet.</p>
          )}

          {detail.items.map(item => (
            <div
              key={item.id}
              data-testid="todo-item"
              data-done={item.done}
              className={`todo-item ${item.done ? 'done' : ''}`}
              role="checkbox"
              aria-checked={item.done}
              onClick={() => handleToggleItem(item.id)}
            >
              <span className="checkbox" aria-hidden="true">{item.done ? '✓' : '○'}</span>
              <span className="todo-text">{item.text}</span>
              <button
                data-testid="delete-item-button"
                className="delete-btn"
                onClick={e => { e.stopPropagation(); handleDeleteItem(item.id) }}
                aria-label={`Delete ${item.text}`}
                title="Delete item"
              >×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
