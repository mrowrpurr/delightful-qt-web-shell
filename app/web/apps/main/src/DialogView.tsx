import { useEffect, useState, useCallback } from 'react'
import { getBridge, signalReady, type TodoBridge, type TodoList } from '@shared/api/bridge'
import { Button } from '@shared/components/ui/button'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@shared/components/ui/select'

const todos = await getBridge<TodoBridge>('todos')

// DialogView — a lightweight UI rendered when the hash is #/dialog.
//
// This proves the "same app, different route" pattern: the main window
// renders App, dialogs render this. Same bridges, same build, different UI.
// Add a todo in the dialog → the main window updates via dataChanged signal.

export default function DialogView() {
  const [lists, setLists] = useState<TodoList[]>([])
  const [selectedListId, setSelectedListId] = useState<string | null>(null)
  const [itemText, setItemText] = useState('')
  const [feedback, setFeedback] = useState('')

  const loadLists = useCallback(async () => {
    const result = await todos.listLists()
    setLists(result)
    if (result.length > 0 && !selectedListId) {
      setSelectedListId(result[0].id)
    }
  }, [selectedListId])

  useEffect(() => { signalReady() }, [])

  useEffect(() => {
    loadLists()
    return todos.dataChanged(() => loadLists())
  }, [loadLists])

  const handleAdd = useCallback(async () => {
    const text = itemText.trim()
    if (!text || !selectedListId) return
    await todos.addItem({ list_id: selectedListId, text }).catch(console.error)
    setItemText('')
    setFeedback('Added!')
    setTimeout(() => setFeedback(''), 1500)
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
            <input
              data-testid="dialog-item-input"
              className="flex-1 h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder="New todo item"
              value={itemText}
              onChange={e => setItemText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              autoFocus
            />
            <Button data-testid="dialog-add-button" onClick={handleAdd}>Add</Button>
          </div>

          {feedback && <span className="text-sm text-primary">{feedback}</span>}
        </>
      )}
    </div>
  )
}
