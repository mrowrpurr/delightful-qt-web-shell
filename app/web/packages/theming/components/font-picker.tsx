import { useState, useEffect, useCallback } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'
import { cn } from '@app/ui/lib/cn'
import { loadGoogleFonts, getGoogleFontsSync, type GoogleFont } from '../lib/fonts'
import { Button } from '@app/ui/components/button'
import { Popover, PopoverContent, PopoverTrigger } from '@app/ui/components/popover'
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@app/ui/components/command'

const CATEGORY_LABELS: Record<string, string> = {
  'sans-serif': 'Sans', 'serif': 'Serif', 'display': 'Display',
  'handwriting': 'Script', 'monospace': 'Mono',
}

const SYSTEM_FONT_VALUE = '__system_default__'

export function FontPicker({ value, onChange }: {
  value: string | null
  onChange: (family: string | null) => void
}) {
  const [fonts, setFonts] = useState<GoogleFont[]>(getGoogleFontsSync() ?? [])
  const [open, setOpen] = useState(false)
  useEffect(() => { loadGoogleFonts().then(setFonts) }, [])

  const select = useCallback((family: string | null) => {
    onChange(family)
    setOpen(false)
  }, [onChange])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between bg-card hover:bg-card"
          data-testid="font-picker-trigger"
        >
          <span className="truncate">{value || 'System default'}</span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command
          filter={(itemValue, search) =>
            itemValue.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
          }
        >
          <CommandInput placeholder={`Search ${fonts.length} fonts...`} />
          <CommandList>
            <CommandEmpty>No fonts found</CommandEmpty>
            <CommandItem
              value={SYSTEM_FONT_VALUE}
              onSelect={() => select(null)}
              className="gap-3"
            >
              <span className={cn('flex-1 truncate', value === null && 'font-medium')}>System default</span>
              {value === null && <Check className="size-4 shrink-0 text-primary" />}
            </CommandItem>
            {fonts.map(font => (
              <CommandItem
                key={font.f}
                value={font.f}
                onSelect={() => select(font.f)}
                className="gap-3"
              >
                <span className={cn('flex-1 truncate', font.f === value && 'font-medium')}>{font.f}</span>
                <span className="text-xs text-muted-foreground shrink-0">{CATEGORY_LABELS[font.c] || font.c}</span>
                {font.f === value && <Check className="size-4 shrink-0 text-primary" />}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
