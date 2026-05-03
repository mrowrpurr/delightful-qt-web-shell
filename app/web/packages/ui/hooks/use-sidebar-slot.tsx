import { createContext, useContext, useEffect, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'

const SidebarSlotContext = createContext<RefObject<HTMLDivElement | null> | null>(null)

export const SidebarSlotProvider = SidebarSlotContext.Provider

// Page-side API: render whatever you want into the sidebar slot.
//   return (
//     <>
//       {useSidebarSlot(<SidebarGroup>...</SidebarGroup>)}
//       <div>main content</div>
//     </>
//   )
// Uses createPortal — page state changes re-render the slot via the normal
// React reconciler, no effect-driven state lifting, no infinite loops.
export function useSidebarSlot(node: ReactNode) {
  const target = useContext(SidebarSlotContext)
  const [el, setEl] = useState<HTMLDivElement | null>(null)
  useEffect(() => { setEl(target?.current ?? null) }, [target])
  return el ? createPortal(node, el) : null
}
