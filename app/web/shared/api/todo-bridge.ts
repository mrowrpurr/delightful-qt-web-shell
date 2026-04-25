import { getBridge } from './bridge'

// TypeScript interface for the TodoBridge C++ bridge.
// CRUD over todo lists + items, with signals for live updates.
// All methods use request objects (def_type DTOs on the C++ side).

export interface TodoList {
  id: string
  name: string
  item_count: number
  created_at: string
}

export interface TodoItem {
  id: string
  list_id: string
  text: string
  done: boolean
  created_at: string
}

export interface ListDetail {
  list: TodoList
  items: TodoItem[]
}

export interface TodoBridge {
  listLists(): Promise<TodoList[]>
  getList(req: { list_id: string }): Promise<ListDetail>
  addList(req: { name: string }): Promise<TodoList>
  addItem(req: { list_id: string; text: string }): Promise<TodoItem>
  toggleItem(req: { item_id: string }): Promise<TodoItem>
  deleteList(req: { list_id: string }): Promise<{ ok: boolean }>
  deleteItem(req: { item_id: string }): Promise<{ ok: boolean }>
  renameList(req: { list_id: string; new_name: string }): Promise<TodoList>
  search(req: { query: string }): Promise<TodoItem[]>
  listAdded(callback: (data: TodoList) => void): () => void
  listRenamed(callback: (data: TodoList) => void): () => void
  listDeleted(callback: (data: { list_id: string }) => void): () => void
  itemAdded(callback: (data: TodoItem) => void): () => void
  itemToggled(callback: (data: TodoItem) => void): () => void
  itemDeleted(callback: (data: { item_id: string }) => void): () => void
}

export async function getTodoBridge(): Promise<TodoBridge> {
  return getBridge<TodoBridge>('todos')
}
