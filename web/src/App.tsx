import { useEffect, useState, useCallback } from 'react'
import { useBridge, signalReady, type TodoBridge, type TodoList, type TodoItem, type ListDetail } from './api/bridge'

// Bridge connects before first render — the Qt loading overlay covers the wait.
// Top-level await is intentional: Vite supports it, and the Qt shell displays a
// loading overlay until signalReady() completes, so there is no visible delay.
const todos = await useBridge<TodoBridge>('todos')

export default function App() {
  const [lists, setLists] = useState<TodoList[]>([])
  const [selectedListId, setSelectedListId] = useState<string | null>(null)
  const [detail, setDetail] = useState<ListDetail | null>(null)
  const [newListName, setNewListName] = useState('')
  const [newItemText, setNewItemText] = useState('')

  const loadLists = useCallback(async () => {
    const result = await todos.listLists()
    setLists(result)
  }, [])

  const loadDetail = useCallback(async (listId: string) => {
    const result = await todos.getList(listId)
    setDetail(result)
  }, [])

  // ╔══════════════════════════════════════════════════════════════════════╗
  // ║  DO NOT REMOVE THIS CALL — IT WILL BREAK THE APP COMPLETELY        ║
  // ║                                                                     ║
  // ║  signalReady() tells the Qt shell that React has mounted.           ║
  // ║  Without it, the loading overlay stays forever and the app          ║
  // ║  appears frozen. There is no error, no crash, just a white          ║
  // ║  screen with a spinner that never goes away.                        ║
  // ║                                                                     ║
  // ║  If you're refactoring this component, move this call but           ║
  // ║  DO NOT DELETE IT. It must run once after the first render.         ║
  // ╚══════════════════════════════════════════════════════════════════════╝
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

  return (
    <div className="app">
      <h1 data-testid="heading">{import.meta.env.VITE_APP_NAME}</h1>
      <p>A template for Qt + React apps with real testing.</p>

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
              onClick={() => handleToggleItem(item.id)}
            >
              <span className="checkbox">{item.done ? '✓' : '○'}</span>
              <span className="todo-text">{item.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
