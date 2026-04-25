import { useEffect, useState, useCallback } from 'react'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { getTodoBridge, type TodoBridge, type TodoList, type ListDetail } from '@shared/api/todo-bridge'
import { getSystemBridge, type SystemBridge } from '@shared/api/system-bridge'
import { Button } from '@shared/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@shared/components/ui/card'
import { Input } from '@shared/components/ui/input'
import { Checkbox } from '@shared/components/ui/checkbox'

// Lazy-init bridges — keep module-import resilient when a bridge isn't reachable
let todos: TodoBridge | null = null
const todosReady = getTodoBridge().then(b => { todos = b; return b }).catch(() => null)
let system: SystemBridge | null = null
getSystemBridge().then(b => { system = b }).catch(() => {})

export default function TodosTab() {
  const [lists, setLists] = useState<TodoList[]>([])
  const [selectedListId, setSelectedListId] = useState<string | null>(null)
  const [detail, setDetail] = useState<ListDetail | null>(null)
  const [newListName, setNewListName] = useState('')
  const [newItemText, setNewItemText] = useState('')

  const loadLists = useCallback(async () => {
    if (!todos) return
    setLists(await todos.listLists())
  }, [])

  const loadDetail = useCallback(async (listId: string) => {
    if (!todos) return
    setDetail(await todos.getList({ list_id: listId }))
  }, [])

  useEffect(() => {
    let cancelled = false
    let cleanup = () => {}
    todosReady.then(b => {
      if (cancelled || !b) return
      loadLists()
      const refresh = () => {
        loadLists()
        if (selectedListId) loadDetail(selectedListId)
      }
      const cleanups = [
        b.listAdded(refresh),
        b.listRenamed(refresh),
        b.listDeleted(refresh),
        b.itemAdded(refresh),
        b.itemToggled(refresh),
        b.itemDeleted(refresh),
      ]
      cleanup = () => cleanups.forEach(c => c())
    })
    return () => { cancelled = true; cleanup() }
  }, [loadLists, loadDetail, selectedListId])

  const selectList = useCallback((listId: string) => {
    setSelectedListId(listId)
    loadDetail(listId)
  }, [loadDetail])

  const handleCreateList = useCallback(async () => {
    if (!todos) return
    const name = newListName.trim()
    if (!name) return
    await todos.addList({ name }).catch(console.error)
    setNewListName('')
  }, [newListName])

  const handleAddItem = useCallback(async () => {
    if (!todos) return
    const text = newItemText.trim()
    if (!text || !selectedListId) return
    await todos.addItem({ list_id: selectedListId, text }).catch(console.error)
    setNewItemText('')
  }, [newItemText, selectedListId])

  const handleToggleItem = useCallback(async (itemId: string) => {
    if (!todos || !selectedListId) return
    await todos.toggleItem({ item_id: itemId }).catch(console.error)
  }, [selectedListId])

  const handleDeleteList = useCallback(async (listId: string) => {
    if (!todos) return
    await todos.deleteList({ list_id: listId }).catch(console.error)
    if (selectedListId === listId) { setSelectedListId(null); setDetail(null) }
  }, [selectedListId])

  const handleDeleteItem = useCallback(async (itemId: string) => {
    if (!todos) return
    await todos.deleteItem({ item_id: itemId }).catch(console.error)
  }, [])

  const handleCopy = useCallback(async () => {
    if (!system) return
    const now = new Date().toLocaleString()
    await system.copyToClipboard({ text: `[Clipboard Test] The current time is now ${now}` })
    toast.success('Copied!')
  }, [])

  return (
    <div className="max-w-2xl mx-auto p-6 flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-primary mb-1">Todo Lists</h2>
        <p className="text-sm text-muted-foreground">Bridge CRUD demo — create, read, update, delete via C++ backend.</p>
      </div>

      <div className="flex gap-2">
        <Button variant="outline" size="sm" data-testid="copy-clipboard-button" onClick={handleCopy}>
          📋 Clipboard
        </Button>
        <Button variant="outline" size="sm" data-testid="open-dialog-button" onClick={() => system?.openDialog()}>
          🗂️ Quick Add
        </Button>
      </div>

      <div className="flex gap-2">
        <Input
          data-testid="new-list-input"
          className="flex-1"
          placeholder="New list name"
          value={newListName}
          onChange={e => setNewListName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleCreateList()}
        />
        <Button data-testid="create-list-button" onClick={handleCreateList}>Create</Button>
      </div>

      {lists.length === 0 && (
        <p data-testid="empty-state" className="text-sm text-muted-foreground text-center py-4">No lists yet. Create one above.</p>
      )}

      <div className="flex flex-col gap-1">
        {lists.map(list => (
          <div
            key={list.id}
            data-testid="todo-list"
            className={`flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-colors border ${
              list.id === selectedListId
                ? 'border-primary bg-primary/10'
                : 'border-transparent hover:bg-accent/50'
            }`}
            onClick={() => selectList(list.id)}
          >
            <span className="font-medium text-sm">{list.name}</span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{list.item_count}</span>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Delete list ${list.name}`}
                data-testid="delete-list-button"
                className="size-7 text-muted-foreground hover:text-destructive"
                onClick={e => { e.stopPropagation(); handleDeleteList(list.id) }}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      {detail && (
        <Card data-testid="list-detail">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{detail.list.name}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex gap-2">
              <Input
                data-testid="new-item-input"
                className="flex-1"
                placeholder="Add todo"
                value={newItemText}
                onChange={e => setNewItemText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddItem()}
              />
              <Button size="sm" data-testid="add-item-button" onClick={handleAddItem}>Add</Button>
            </div>

            {detail.items.length === 0 && (
              <p className="text-sm text-muted-foreground">No items yet.</p>
            )}

            {detail.items.map(item => (
              <div
                key={item.id}
                data-testid="todo-item"
                data-done={item.done}
                className={`flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer transition-colors hover:bg-accent/30 ${item.done ? 'opacity-60' : ''}`}
                role="checkbox"
                aria-checked={item.done}
                onClick={() => handleToggleItem(item.id)}
              >
                <Checkbox checked={item.done} tabIndex={-1} className="pointer-events-none" aria-hidden />
                <span className={`flex-1 text-sm ${item.done ? 'line-through text-muted-foreground' : ''}`}>{item.text}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete item ${item.text}`}
                  data-testid="delete-item-button"
                  className="size-7 text-muted-foreground hover:text-destructive"
                  onClick={e => { e.stopPropagation(); handleDeleteItem(item.id) }}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
