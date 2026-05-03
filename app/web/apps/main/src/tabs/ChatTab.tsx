import { useState } from 'react'
import { Button } from '@app/ui/components/button'
import { Input } from '@app/ui/components/input'
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@app/ui/components/sidebar'
import { useSidebarSlot } from '@app/ui/hooks/use-sidebar-slot'

type Session = { id: string, title: string }

export default function ChatTab() {
  const [sessions, setSessions] = useState<Session[]>([
    { id: 's1', title: 'Designing the bridge protocol' },
    { id: 's2', title: 'Why does QtWebEngine swallow drag events?' },
    { id: 's3', title: 'Sidebar collapse animation polish' },
    { id: 's4', title: 'Theme generator: SCSS vs direct substitution' },
    { id: 's5', title: 'Five test layers — what to run when' },
    { id: 's6', title: 'WASM bridge wrapper deep dive' },
  ])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  // The page renders its own sidebar JSX and portals it into the slot.
  const sidebarSlot = useSidebarSlot(
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>Recent</SidebarGroupLabel>
      <SidebarMenu>
        {sessions.map(session => (
          <SidebarMenuItem key={session.id}>
            <SidebarMenuButton
              isActive={activeId === session.id}
              onClick={() => setActiveId(session.id)}
              tooltip={session.title}
              data-testid={`chat-session-${session.id}`}
            >
              <span className="truncate">{session.title}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  )

  return (
    <>
    {sidebarSlot}
    <div className="mx-auto flex h-full min-h-[60vh] max-w-xl flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="space-y-2">
        <div className="text-4xl">💬</div>
        <h1 className="text-xl font-semibold">Chat</h1>
        <p className="text-sm text-muted-foreground">
          Active session: <strong>{activeId ?? 'none'}</strong>
        </p>
      </div>
      <form
        className="flex w-full gap-2"
        onSubmit={e => {
          e.preventDefault()
          const title = draft.trim()
          if (!title) return
          setSessions(prev => [{ id: crypto.randomUUID(), title }, ...prev])
          setDraft('')
        }}
      >
        <Input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder="New session title…"
          data-testid="chat-new-input"
        />
        <Button type="submit" disabled={!draft.trim()} data-testid="chat-new-button">
          New chat
        </Button>
      </form>
    </div>
    </>
  )
}
