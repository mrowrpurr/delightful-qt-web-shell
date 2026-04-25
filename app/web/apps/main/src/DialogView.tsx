import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { signalReady } from '@shared/api/bridge'
import { getTodoBridge, type TodoBridge, type TodoList } from '@shared/api/todo-bridge'
import { Button } from '@shared/components/ui/button'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@shared/components/ui/select'
import { Input } from '@shared/components/ui/input'
import { Toaster } from '@shared/components/ui/sonner'

// Lazy-init bridge — keeps module-import resilient when the bridge isn't reachable
let todos: TodoBridge | null = null
const todosReady = getTodoBridge().then(b => { todos = b; return b }).catch(() => null)

// DialogView — a lightweight UI rendered when the hash is #/dialog.
//
// This proves the "same app, different route" pattern: the main window
// renders App, dialogs render this. Same bridges, same build, different UI.
// Add a todo in the dialog → the main window updates via bridge signals.

export default function DialogView() {
  const [lists, setLists] = useState<TodoList[]>([])
  const [selectedListId, setSelectedListId] = useState<string | null>(null)
  const [itemText, setItemText] = useState('')

  const loadLists = useCallback(async () => {
    if (!todos) return
    const result = await todos.listLists()
    setLists(result)
    if (result.length > 0 && !selectedListId) {
      setSelectedListId(result[0].id)
    }
  }, [selectedListId])

  useEffect(() => { signalReady() }, [])

  useEffect(() => {
    let cancelled = false
    let cleanup = () => {}
    todosReady.then(b => {
      if (cancelled || !b) return
      loadLists()
      const refresh = () => loadLists()
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
  }, [loadLists])

  const handleAdd = useCallback(async () => {
    if (!todos) return
    const text = itemText.trim()
    if (!text || !selectedListId) return
    await todos.addItem({ list_id: selectedListId, text }).catch(console.error)
    setItemText('')
    toast.success('Added!')
  }, [itemText, selectedListId])

  return (
    <div className="min-h-screen bg-background text-foreground p-8 flex flex-col items-center gap-4 max-w-md mx-auto">
      <h2 className="text-xl font-semibold text-primary">Quick Add Todo</h2>
      <p className="text-sm text-muted-foreground text-center">Add an item — it appears in the main window instantly.</p>

      {lists.length === 0 ? (
        <p className="text-sm text-muted-foreground">No lists yet. Create one in the main window first.</p>
      ) : (
        <>
          <Select value={selectedListId ?? ''} onValueChange={setSelectedListId}>
            <SelectTrigger className="w-full" data-testid="dialog-list-select">
              <SelectValue placeholder="Select a list..." />
            </SelectTrigger>
            <SelectContent>
              {lists.map(list => (
                <SelectItem key={list.id} value={list.id}>
                  {list.name} ({list.item_count} items)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex gap-2 w-full">
            <Input
              data-testid="dialog-item-input"
              className="flex-1"
              placeholder="New todo item"
              value={itemText}
              onChange={e => setItemText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              autoFocus
            />
            <Button data-testid="dialog-add-button" onClick={handleAdd}>Add</Button>
          </div>

        </>
      )}
      <Toaster />
    </div>
  )
}
