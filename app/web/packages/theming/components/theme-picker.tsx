import { useState, useEffect } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'
import { cn } from '@app/ui/lib/cn'
import { loadThemeIndex, type ThemeIndexEntry } from '../lib/themes'
import { Button } from '@app/ui/components/button'
import { Popover, PopoverContent, PopoverTrigger } from '@app/ui/components/popover'
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@app/ui/components/command'

export function ThemePicker({ value, isDark, onChange }: {
  value: string
  isDark: boolean
  onChange: (name: string) => void
}) {
  const [index, setIndex] = useState<ThemeIndexEntry[]>([])
  const [open, setOpen] = useState(false)

  // Lazy-load the picker index only when the popover first opens —
  // saves the ~150KB chunk on cold starts that never visit the picker.
  useEffect(() => {
    if (open && index.length === 0) {
      loadThemeIndex().then(setIndex)
    }
  }, [open, index.length])

  const previewFor = (entry: ThemeIndexEntry) => (isDark ? entry.pD : entry.pL) || '#888'
  const currentEntry = index.find(t => t.name === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between bg-card hover:bg-card"
          data-testid="theme-picker-trigger"
        >
          <span className="flex items-center gap-2 truncate">
            <span
              className="w-4 h-4 rounded-full shrink-0 border border-border"
              style={{ backgroundColor: currentEntry ? previewFor(currentEntry) : 'var(--primary)' }}
            />
            <span className="truncate">{value || 'Default'}</span>
          </span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command
          filter={(itemValue, search) =>
            itemValue.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
          }
        >
          <CommandInput placeholder={index.length ? `Search ${index.length} themes...` : 'Loading themes...'} />
          <CommandList>
            <CommandEmpty>No themes found</CommandEmpty>
            {index.map(t => (
              <CommandItem
                key={t.name}
                value={t.name}
                onSelect={() => { onChange(t.name); setOpen(false) }}
                className="gap-3"
              >
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: previewFor(t) }}
                />
                <span className={cn('flex-1 truncate', t.name === value && 'font-medium')}>{t.name}</span>
                {t.name === value && <Check className="size-4 shrink-0 text-primary" />}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
