"use client"

import { useEffect, useState } from "react"
import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { Toaster as Sonner, type ToasterProps } from "sonner"

import { isDarkMode } from "@shared/lib/themes"

// Sonner mode-tracker — listens for theme changes the same way the rest of
// the app does (page-transparency-changed / qt-theme-synced both fire on
// dark/light flips), so the toaster reflects the active palette.
function useDarkMode(): boolean {
  const [dark, setDark] = useState(isDarkMode)
  useEffect(() => {
    const refresh = () => setDark(isDarkMode())
    window.addEventListener("qt-theme-synced", refresh)
    window.addEventListener("editor-theme-changed", refresh)
    return () => {
      window.removeEventListener("qt-theme-synced", refresh)
      window.removeEventListener("editor-theme-changed", refresh)
    }
  }, [])
  return dark
}

const Toaster = ({ ...props }: ToasterProps) => {
  const dark = useDarkMode()

  return (
    <Sonner
      theme={dark ? "dark" : "light"}
      richColors
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
          "--success-bg": "var(--primary)",
          "--success-text": "var(--primary-foreground)",
          "--success-border": "var(--primary)",
          "--error-bg": "var(--destructive)",
          "--error-text": "var(--destructive-foreground)",
          "--error-border": "var(--destructive)",
          "--warning-bg": "var(--accent)",
          "--warning-text": "var(--accent-foreground)",
          "--warning-border": "var(--accent)",
          "--info-bg": "var(--muted)",
          "--info-text": "var(--muted-foreground)",
          "--info-border": "var(--border)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
