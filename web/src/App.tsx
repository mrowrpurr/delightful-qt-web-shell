import { useEffect, useState, useCallback } from 'react'
import { getBridge, signalReady, type TodoBridge, type TodoList, type TodoItem, type ListDetail } from './api/bridge'
import type { SystemBridge } from './api/system-bridge'

// Top-level await — Vite supports this natively.
// Runs before React mounts. The Qt shell shows a loading overlay during this time,
// so there's no visible delay. Safe to move but must stay at module scope (not
// inside a component), because getBridge returns a long-lived proxy, not per-render state.
const todos = await getBridge<TodoBridge>('todos')
const system = await getBridge<SystemBridge>('system')

export default function App() {
  const [lists, setLists] = useState<TodoList[]>([])
  const [selectedListId, setSelectedListId] = useState<string | null>(null)
  const [detail, setDetail] = useState<ListDetail | null>(null)
  const [newListName, setNewListName] = useState('')
  const [newItemText, setNewItemText] = useState('')
  const [droppedFiles, setDroppedFiles] = useState<string[]>([])
  const [copyFeedback, setCopyFeedback] = useState('')

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

  // Subscribe to file drop events from Qt
  useEffect(() => {
    return system.filesDropped(async () => {
      const files = await system.getDroppedFiles()
      setDroppedFiles(files)
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
        {copyFeedback && <span className="feedback">{copyFeedback}</span>}
      </div>

      {droppedFiles.length > 0 && (
        <div className="dropped-files" data-testid="dropped-files">
          <strong>Dropped files:</strong>
          {droppedFiles.map((file, i) => (
            <div key={i} className="dropped-file">{file}</div>
          ))}
        </div>
      )}

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
