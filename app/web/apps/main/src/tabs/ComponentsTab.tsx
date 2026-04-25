import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Bell, Bold, Calendar as CalendarIcon, Check, ChevronDown, ChevronRight, ChevronsUpDown,
  Cloud, CreditCard, Italic, LifeBuoy, LogOut, Mail, MessageSquare, Plus,
  Search, Settings, Star, Trash2, Underline, User, UserPlus, Users,
} from 'lucide-react'
import { toast } from 'sonner'

// Forms
import { Button } from '@shared/components/ui/button'
import { ButtonGroup } from '@shared/components/ui/button-group'
import { Input } from '@shared/components/ui/input'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@shared/components/ui/input-group'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@shared/components/ui/input-otp'
import { Textarea } from '@shared/components/ui/textarea'
import { Label } from '@shared/components/ui/label'
import { Checkbox } from '@shared/components/ui/checkbox'
import { Switch } from '@shared/components/ui/switch'
import { RadioGroup, RadioGroupItem } from '@shared/components/ui/radio-group'
import { Slider } from '@shared/components/ui/slider'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/components/ui/select'
import { Toggle } from '@shared/components/ui/toggle'
import { ToggleGroup, ToggleGroupItem } from '@shared/components/ui/toggle-group'

// Combobox via popover + cmdk (the same composition used by SettingsTab pickers)
import { Popover, PopoverContent, PopoverTrigger } from '@shared/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@shared/components/ui/command'

// Multi-select chips combobox (base-ui)
import { Combobox, ComboboxChips, ComboboxChip, ComboboxChipsInput, ComboboxCollection, ComboboxContent, ComboboxEmpty, ComboboxItem, ComboboxList } from '@shared/components/ui/combobox'

// Field + Form (react-hook-form integration)
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSeparator, FieldSet } from '@shared/components/ui/field'
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@shared/components/ui/form'
import { SelectGroup, SelectLabel, SelectSeparator } from '@shared/components/ui/select'

// DropdownMenu enriched
import {
  DropdownMenuCheckboxItem, DropdownMenuGroup, DropdownMenuPortal,
  DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuShortcut,
  DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger,
} from '@shared/components/ui/dropdown-menu'
import {
  ContextMenuCheckboxItem, ContextMenuLabel, ContextMenuRadioGroup, ContextMenuRadioItem,
  ContextMenuSeparator, ContextMenuShortcut, ContextMenuSub, ContextMenuSubContent,
  ContextMenuSubTrigger,
} from '@shared/components/ui/context-menu'
import {
  MenubarCheckboxItem, MenubarRadioGroup, MenubarRadioItem, MenubarShortcut,
  MenubarSub, MenubarSubContent, MenubarSubTrigger,
} from '@shared/components/ui/menubar'
import { BreadcrumbEllipsis } from '@shared/components/ui/breadcrumb'
import { EmptyContent } from '@shared/components/ui/empty'

// Display
import { Avatar, AvatarFallback, AvatarImage } from '@shared/components/ui/avatar'
import { Badge } from '@shared/components/ui/badge'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@shared/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@shared/components/ui/alert'
import { Skeleton } from '@shared/components/ui/skeleton'
import { Spinner } from '@shared/components/ui/spinner'
import { Progress } from '@shared/components/ui/progress'
import { Separator } from '@shared/components/ui/separator'
import { Kbd } from '@shared/components/ui/kbd'
import { AspectRatio } from '@shared/components/ui/aspect-ratio'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@shared/components/ui/empty'

// Navigation
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@shared/components/ui/tabs'
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@shared/components/ui/breadcrumb'
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@shared/components/ui/pagination'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@shared/components/ui/dropdown-menu'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@shared/components/ui/context-menu'
import { Menubar, MenubarContent, MenubarItem, MenubarMenu, MenubarSeparator, MenubarTrigger } from '@shared/components/ui/menubar'
import { NavigationMenu, NavigationMenuContent, NavigationMenuItem, NavigationMenuLink, NavigationMenuList, NavigationMenuTrigger } from '@shared/components/ui/navigation-menu'

// Overlays
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@shared/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@shared/components/ui/alert-dialog'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@shared/components/ui/sheet'
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle, DrawerTrigger } from '@shared/components/ui/drawer'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@shared/components/ui/tooltip'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@shared/components/ui/hover-card'

// Containers
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@shared/components/ui/accordion'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@shared/components/ui/collapsible'
import { ScrollArea } from '@shared/components/ui/scroll-area'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@shared/components/ui/resizable'
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '@shared/components/ui/carousel'
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@shared/components/ui/table'
import { Item, ItemContent, ItemDescription, ItemMedia, ItemTitle } from '@shared/components/ui/item'

// Data
import { Calendar } from '@shared/components/ui/calendar'

// ── Section helper ─────────────────────────────────────────

function Section({ id, title, blurb, children }: { id: string; title: string; blurb?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="space-y-3 scroll-mt-6">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold text-primary">{title}</h3>
        <a href="#toc" className="text-xs text-muted-foreground hover:text-foreground">↑ top</a>
      </div>
      {blurb && <p className="text-sm text-muted-foreground">{blurb}</p>}
      <div className="rounded-lg border border-border bg-card p-4">{children}</div>
    </section>
  )
}

// ── Table of contents ──────────────────────────────────────

const TOC: Array<{ group: string; items: Array<{ id: string; label: string }> }> = [
  {
    group: 'Forms',
    items: [
      { id: 'button', label: 'Button' },
      { id: 'button-group', label: 'ButtonGroup' },
      { id: 'input', label: 'Input' },
      { id: 'input-group', label: 'InputGroup' },
      { id: 'input-otp', label: 'InputOTP' },
      { id: 'textarea', label: 'Textarea' },
      { id: 'label', label: 'Label' },
      { id: 'checkbox', label: 'Checkbox' },
      { id: 'switch', label: 'Switch' },
      { id: 'radio-group', label: 'RadioGroup' },
      { id: 'slider', label: 'Slider' },
      { id: 'select', label: 'Select' },
      { id: 'combobox', label: 'Combobox' },
      { id: 'multi-select-list', label: 'Multi-select list' },
      { id: 'field', label: 'Field' },
      { id: 'form', label: 'Form' },
      { id: 'toggle', label: 'Toggle' },
      { id: 'toggle-group', label: 'ToggleGroup' },
    ],
  },
  {
    group: 'Display',
    items: [
      { id: 'badge', label: 'Badge' },
      { id: 'avatar', label: 'Avatar' },
      { id: 'card', label: 'Card' },
      { id: 'alert', label: 'Alert' },
      { id: 'skeleton', label: 'Skeleton' },
      { id: 'spinner', label: 'Spinner' },
      { id: 'progress', label: 'Progress' },
      { id: 'separator', label: 'Separator' },
      { id: 'kbd', label: 'Kbd' },
      { id: 'aspect-ratio', label: 'AspectRatio' },
      { id: 'empty', label: 'Empty' },
    ],
  },
  {
    group: 'Navigation',
    items: [
      { id: 'tabs', label: 'Tabs' },
      { id: 'breadcrumb', label: 'Breadcrumb' },
      { id: 'pagination', label: 'Pagination' },
      { id: 'dropdown-menu', label: 'DropdownMenu' },
      { id: 'context-menu', label: 'ContextMenu' },
      { id: 'menubar', label: 'Menubar' },
      { id: 'navigation-menu', label: 'NavigationMenu' },
    ],
  },
  {
    group: 'Overlays',
    items: [
      { id: 'dialog', label: 'Dialog' },
      { id: 'alert-dialog', label: 'AlertDialog' },
      { id: 'sheet', label: 'Sheet' },
      { id: 'drawer', label: 'Drawer' },
      { id: 'popover', label: 'Popover' },
      { id: 'tooltip', label: 'Tooltip' },
      { id: 'hover-card', label: 'HoverCard' },
      { id: 'sonner', label: 'Sonner (toast)' },
    ],
  },
  {
    group: 'Containers',
    items: [
      { id: 'accordion', label: 'Accordion' },
      { id: 'collapsible', label: 'Collapsible' },
      { id: 'scroll-area', label: 'ScrollArea' },
      { id: 'resizable', label: 'Resizable' },
      { id: 'carousel', label: 'Carousel' },
      { id: 'table', label: 'Table' },
      { id: 'item', label: 'Item' },
    ],
  },
  {
    group: 'Data',
    items: [
      { id: 'calendar', label: 'Calendar' },
      { id: 'chart', label: 'Chart' },
    ],
  },
]

function TableOfContents() {
  return (
    <nav id="toc" aria-label="Components table of contents" className="rounded-lg border border-border bg-card p-4 scroll-mt-6">
      <div className="mb-3 text-sm font-semibold text-primary">Jump to component</div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
        {TOC.map(group => (
          <div key={group.group}>
            <div className="mb-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">{group.group}</div>
            <ul className="space-y-0.5">
              {group.items.map(item => (
                <li key={item.id}>
                  <a href={`#${item.id}`} className="text-sm text-foreground hover:text-primary">{item.label}</a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  )
}

const FRAMEWORKS = ['Next.js', 'SvelteKit', 'Nuxt.js', 'Remix', 'Astro', 'Qwik', 'Solid', 'Hono']
const TAGS = ['typescript', 'react', 'tailwind', 'shadcn', 'radix', 'cmdk', 'monaco', 'qt', 'wasm', 'vite']

function ComboboxSingle() {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState<string>('Next.js')
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className="w-[220px] justify-between">
          {value || 'Select framework...'}
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[220px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search framework..." />
          <CommandList>
            <CommandEmpty>No framework found.</CommandEmpty>
            {FRAMEWORKS.map(f => (
              <CommandItem key={f} value={f} onSelect={() => { setValue(f); setOpen(false) }}>
                <span className="flex-1">{f}</span>
                {f === value && <Check className="size-4 text-primary" />}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

function MultiSelectDropdown() {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set(['typescript', 'tailwind']))
  const toggle = (tag: string) => {
    const next = new Set(selected)
    if (next.has(tag)) next.delete(tag); else next.add(tag)
    setSelected(next)
  }
  const summary =
    selected.size === 0 ? 'Select tags…'
    : selected.size <= 2 ? Array.from(selected).join(', ')
    : `${Array.from(selected).slice(0, 2).join(', ')} +${selected.size - 2}`

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" role="combobox" aria-expanded={open} className="w-[260px] justify-between">
          <span className="truncate">{summary}</span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[260px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Filter tags…" />
          <CommandList>
            <CommandEmpty>No tag found.</CommandEmpty>
            <CommandGroup heading={`${selected.size} of ${TAGS.length} selected`}>
              {TAGS.map(tag => (
                <CommandItem key={tag} value={tag} onSelect={() => toggle(tag)} className="gap-2">
                  <Checkbox checked={selected.has(tag)} className="pointer-events-none" tabIndex={-1} aria-hidden />
                  <span className="flex-1">{tag}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

function ComboboxMultiChips() {
  const [value, setValue] = useState<string[]>(['typescript', 'tailwind'])
  return (
    <Combobox
      items={TAGS}
      value={value}
      onValueChange={(v) => setValue(v as string[])}
      multiple
    >
      <ComboboxChips className="w-full max-w-md">
        {value.map(tag => (
          <ComboboxChip key={tag}>{tag}</ComboboxChip>
        ))}
        <ComboboxChipsInput placeholder={value.length ? 'Filter…' : 'Type to filter, click to add…'} />
      </ComboboxChips>
      <ComboboxContent>
        <ComboboxEmpty>No tag matches</ComboboxEmpty>
        <ComboboxList>
          <ComboboxCollection>
            {(tag: string) => (
              <ComboboxItem key={tag} value={tag}>{tag}</ComboboxItem>
            )}
          </ComboboxCollection>
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}

const PERMISSIONS = ['read', 'write', 'delete', 'admin', 'invite', 'billing', 'audit-log']

function MultiSelectListview() {
  const [selected, setSelected] = useState<Set<string>>(new Set(['read', 'write']))
  const toggle = (perm: string) => {
    const next = new Set(selected)
    if (next.has(perm)) next.delete(perm); else next.add(perm)
    setSelected(next)
  }
  return (
    <div className="rounded-md border border-border bg-popover w-full max-w-sm">
      <Command>
        <CommandInput placeholder="Filter permissions…" />
        <CommandList>
          <CommandEmpty>No permission found.</CommandEmpty>
          <CommandGroup heading={`${selected.size} of ${PERMISSIONS.length} selected`}>
            {PERMISSIONS.map(perm => (
              <CommandItem key={perm} value={perm} onSelect={() => toggle(perm)} className="gap-2">
                <Checkbox checked={selected.has(perm)} className="pointer-events-none" tabIndex={-1} aria-hidden />
                <span className="flex-1">{perm}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </div>
  )
}

const profileSchema = z.object({
  username: z.string().min(2, 'At least 2 characters').max(20, 'Too long'),
  email: z.email('Invalid email'),
  bio: z.string().max(160).optional(),
})
type ProfileForm = z.infer<typeof profileSchema>

function FormDemo() {
  const form = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: { username: '', email: '', bio: '' },
  })
  const onSubmit = (data: ProfileForm) => {
    toast.success(`Submitted: ${JSON.stringify(data)}`)
  }
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 max-w-md">
        <FormField
          control={form.control}
          name="username"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Username</FormLabel>
              <FormControl><Input placeholder="shadcn" {...field} /></FormControl>
              <FormDescription>This is your public display name.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl><Input type="email" placeholder="you@example.com" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="bio"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Bio</FormLabel>
              <FormControl><Textarea placeholder="Tell us a little about yourself" {...field} /></FormControl>
              <FormDescription>Up to 160 characters.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit">Submit</Button>
      </form>
    </Form>
  )
}

// ── Page ────────────────────────────────────────────────────

export default function ComponentsTab() {
  const [progress] = useState(63)
  const [sliderValue, setSliderValue] = useState([42])
  const [rangeSlider, setRangeSlider] = useState([20, 75])
  const [checked, setChecked] = useState<boolean | 'indeterminate'>(true)
  const [switchOn, setSwitchOn] = useState(true)
  const [radio, setRadio] = useState('comfortable')
  const [toggle, setToggle] = useState(false)
  const [toggleGroup, setToggleGroup] = useState<string[]>(['bold'])
  const [otp, setOtp] = useState('')
  const [date, setDate] = useState<Date | undefined>(new Date())
  const [dateRange, setDateRange] = useState<{ from: Date; to?: Date } | undefined>({
    from: new Date(),
    to: new Date(Date.now() + 5 * 86400000),
  })
  const [multiDates, setMultiDates] = useState<Date[]>([new Date()])
  const [showStatusBar, setShowStatusBar] = useState(true)
  const [showActivityBar, setShowActivityBar] = useState(false)
  const [showPanel, setShowPanel] = useState(false)
  const [menuPosition, setMenuPosition] = useState('bottom')
  const [ctxBookmarks, setCtxBookmarks] = useState(true)
  const [ctxFullUrls, setCtxFullUrls] = useState(false)
  const [ctxPerson, setCtxPerson] = useState('pedro')
  const [menubarVisible, setMenubarVisible] = useState(true)
  const [menubarProfile, setMenubarProfile] = useState('andy')

  return (
    <TooltipProvider>
      <div className="max-w-4xl mx-auto p-6 space-y-8">
        <header>
          <h2 className="text-2xl font-bold">🧩 Components</h2>
          <p className="text-sm text-muted-foreground">
            Every installed shadcn primitive against the live theme. Switch themes in <code>🎨 Settings</code> —
            this page is your regression check across all 1030+ palettes.
          </p>
        </header>

        <TableOfContents />

        {/* ── Forms ─────────────────────────────────────── */}

        <Section id="button" title="Button" blurb="6 variants × 4 sizes.">
          <div className="flex flex-wrap items-center gap-2">
            <Button>Default</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="destructive">Destructive</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="link">Link</Button>
            <Separator orientation="vertical" className="h-6" />
            <Button size="sm">Small</Button>
            <Button size="lg">Large</Button>
            <Button size="icon" aria-label="add"><Plus /></Button>
            <Button variant="outline" size="icon" aria-label="delete"><Trash2 /></Button>
            <Button disabled>Disabled</Button>
          </div>
        </Section>

        <Section id="button-group" title="ButtonGroup">
          <ButtonGroup>
            <Button variant="outline">Cut</Button>
            <Button variant="outline">Copy</Button>
            <Button variant="outline">Paste</Button>
          </ButtonGroup>
        </Section>

        <Section id="input" title="Input" blurb="With label, placeholder, file, disabled.">
          <div className="grid grid-cols-2 gap-4 max-w-xl">
            <div className="space-y-1.5">
              <Label htmlFor="demo-email">Email</Label>
              <Input id="demo-email" type="email" placeholder="you@example.com" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="demo-disabled">Disabled</Label>
              <Input id="demo-disabled" placeholder="Can't edit" disabled />
            </div>
          </div>
        </Section>

        <Section id="input-group" title="InputGroup" blurb="Input with leading/trailing icon or addon.">
          <InputGroup className="max-w-sm">
            <InputGroupAddon align="inline-start">
              <Search className="size-4" />
            </InputGroupAddon>
            <InputGroupInput placeholder="Search anything..." />
          </InputGroup>
        </Section>

        <Section id="input-otp" title="InputOTP" blurb="One-time code input.">
          <InputOTP maxLength={6} value={otp} onChange={setOtp}>
            <InputOTPGroup>
              {[0, 1, 2, 3, 4, 5].map(i => <InputOTPSlot key={i} index={i} />)}
            </InputOTPGroup>
          </InputOTP>
        </Section>

        <Section id="textarea" title="Textarea">
          <Textarea placeholder="Type your message…" className="max-w-xl" />
        </Section>

        <Section id="label" title="Label">
          <div className="flex items-center gap-2">
            <Checkbox id="demo-label-cb" />
            <Label htmlFor="demo-label-cb">Subscribe to the newsletter</Label>
          </div>
        </Section>

        <Section id="checkbox" title="Checkbox">
          <div className="flex flex-col gap-2">
            <Label htmlFor="demo-cb-1" className="font-normal">
              <Checkbox id="demo-cb-1" checked={checked} onCheckedChange={setChecked} />
              Accept terms and conditions
            </Label>
            <Label htmlFor="demo-cb-2" className="font-normal">
              <Checkbox id="demo-cb-2" defaultChecked />
              Default checked
            </Label>
            <Label htmlFor="demo-cb-3" className="font-normal text-muted-foreground">
              <Checkbox id="demo-cb-3" disabled />
              Disabled
            </Label>
          </div>
        </Section>

        <Section id="switch" title="Switch">
          <div className="flex flex-col gap-3">
            <Label htmlFor="demo-sw-1" className="font-normal">
              <Switch id="demo-sw-1" checked={switchOn} onCheckedChange={setSwitchOn} />
              Notifications {switchOn ? 'on' : 'off'}
            </Label>
            <Label htmlFor="demo-sw-2" className="font-normal text-muted-foreground">
              <Switch id="demo-sw-2" size="sm" disabled />
              Disabled
            </Label>
          </div>
        </Section>

        <Section id="radio-group" title="RadioGroup">
          <RadioGroup value={radio} onValueChange={setRadio} className="space-y-2">
            {['default', 'comfortable', 'compact'].map(v => (
              <Label key={v} htmlFor={`demo-radio-${v}`} className="font-normal capitalize">
                <RadioGroupItem id={`demo-radio-${v}`} value={v} />
                {v}
              </Label>
            ))}
          </RadioGroup>
        </Section>

        <Section id="slider" title="Slider" blurb="Single thumb + range (two thumbs).">
          <div className="space-y-4 max-w-md">
            <div className="flex items-center gap-3">
              <Slider value={sliderValue} onValueChange={setSliderValue} max={100} step={1} className="flex-1" />
              <span className="text-sm tabular-nums text-muted-foreground w-12 text-right">{sliderValue[0]}</span>
            </div>
            <div className="flex items-center gap-3">
              <Slider value={rangeSlider} onValueChange={setRangeSlider} max={100} step={1} className="flex-1" />
              <span className="text-sm tabular-nums text-muted-foreground w-12 text-right">{rangeSlider[0]}–{rangeSlider[1]}</span>
            </div>
          </div>
        </Section>

        <Section id="select" title="Select" blurb="Radix Select with grouped options. Portal-based to dodge QWebEngine's native &lt;select&gt; bug.">
          <div className="flex flex-wrap gap-3">
            <Select defaultValue="apple">
              <SelectTrigger className="w-[220px]"><SelectValue placeholder="Pick a fruit" /></SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Fruits</SelectLabel>
                  <SelectItem value="apple">Apple</SelectItem>
                  <SelectItem value="banana">Banana</SelectItem>
                  <SelectItem value="blueberry">Blueberry</SelectItem>
                  <SelectItem value="grapes">Grapes</SelectItem>
                  <SelectItem value="pineapple">Pineapple</SelectItem>
                </SelectGroup>
                <SelectSeparator />
                <SelectGroup>
                  <SelectLabel>Vegetables</SelectLabel>
                  <SelectItem value="carrot">Carrot</SelectItem>
                  <SelectItem value="kale">Kale</SelectItem>
                  <SelectItem value="onion">Onion</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <Select disabled>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Disabled" /></SelectTrigger>
              <SelectContent />
            </Select>
          </div>
        </Section>

        <Section id="combobox" title="Combobox" blurb="Single-select dropdown, multi-select dropdown (button + filter + checkbox list), and multi-select chips.">
          <div className="space-y-5">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Single-select dropdown</p>
              <ComboboxSingle />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Multi-select dropdown — button trigger + search + checkbox list</p>
              <MultiSelectDropdown />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Multi-select chips — selections inline in trigger</p>
              <ComboboxMultiChips />
            </div>
          </div>
        </Section>

        <Section id="multi-select-list" title="Multi-select listview" blurb="Command + Checkbox indicators per item. Pattern for picking N from a list.">
          <MultiSelectListview />
        </Section>

        <Section id="field" title="Field" blurb="Field primitive for forms — group label, control, description, error.">
          <FieldSet className="max-w-md">
            <FieldLegend>Notification preferences</FieldLegend>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="field-email">Email address</FieldLabel>
                <Input id="field-email" type="email" placeholder="you@example.com" />
                <FieldDescription>We'll never share your email.</FieldDescription>
              </Field>
              <FieldSeparator />
              <Field orientation="horizontal">
                <Switch id="field-marketing" defaultChecked />
                <FieldLabel htmlFor="field-marketing">Marketing emails</FieldLabel>
              </Field>
              <Field orientation="horizontal">
                <Switch id="field-product" />
                <FieldLabel htmlFor="field-product">Product updates</FieldLabel>
              </Field>
              <Field data-invalid="true">
                <FieldLabel htmlFor="field-handle">Handle</FieldLabel>
                <Input id="field-handle" defaultValue="sh@dcn" aria-invalid />
                <FieldError>Letters, numbers, and underscores only.</FieldError>
              </Field>
            </FieldGroup>
          </FieldSet>
        </Section>

        <Section id="form" title="Form" blurb="React Hook Form + Zod validation. Submit logs a toast.">
          <FormDemo />
        </Section>

        <Section id="toggle" title="Toggle">
          <Toggle pressed={toggle} onPressedChange={setToggle} aria-label="Toggle bold">
            <Bold />
          </Toggle>
        </Section>

        <Section id="toggle-group" title="ToggleGroup">
          <ToggleGroup type="multiple" value={toggleGroup} onValueChange={setToggleGroup}>
            <ToggleGroupItem value="bold" aria-label="Bold"><Bold /></ToggleGroupItem>
            <ToggleGroupItem value="italic" aria-label="Italic"><Italic /></ToggleGroupItem>
            <ToggleGroupItem value="underline" aria-label="Underline"><Underline /></ToggleGroupItem>
          </ToggleGroup>
        </Section>

        {/* ── Display ───────────────────────────────────── */}

        <Section id="badge" title="Badge">
          <div className="flex flex-wrap gap-2">
            <Badge>Default</Badge>
            <Badge variant="secondary">Secondary</Badge>
            <Badge variant="destructive">Destructive</Badge>
            <Badge variant="outline">Outline</Badge>
          </div>
        </Section>

        <Section id="avatar" title="Avatar">
          <div className="flex items-center gap-3">
            <Avatar>
              <AvatarImage src="https://github.com/shadcn.png" alt="" />
              <AvatarFallback>CN</AvatarFallback>
            </Avatar>
            <Avatar>
              <AvatarFallback>MP</AvatarFallback>
            </Avatar>
            <Avatar className="size-12">
              <AvatarFallback><User /></AvatarFallback>
            </Avatar>
          </div>
        </Section>

        <Section id="card" title="Card">
          <Card className="max-w-sm">
            <CardHeader>
              <CardTitle>Notifications</CardTitle>
              <CardDescription>You have 3 unread messages.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              Push notifications are enabled across all your devices.
            </CardContent>
            <CardFooter>
              <Button size="sm" variant="outline">Mark all as read</Button>
            </CardFooter>
          </Card>
        </Section>

        <Section id="alert" title="Alert">
          <div className="space-y-3">
            <Alert>
              <Bell />
              <AlertTitle>Heads up!</AlertTitle>
              <AlertDescription>You can add components to your app using the CLI.</AlertDescription>
            </Alert>
            <Alert variant="destructive">
              <AlertTitle>Something went wrong</AlertTitle>
              <AlertDescription>Your changes could not be saved. Try again.</AlertDescription>
            </Alert>
          </div>
        </Section>

        <Section id="skeleton" title="Skeleton">
          <div className="flex items-center space-x-4">
            <Skeleton className="size-12 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-[250px]" />
              <Skeleton className="h-4 w-[200px]" />
            </div>
          </div>
        </Section>

        <Section id="spinner" title="Spinner">
          <div className="flex items-center gap-4">
            <Spinner />
            <Spinner className="size-6" />
            <Spinner className="size-8" />
          </div>
        </Section>

        <Section id="progress" title="Progress">
          <Progress value={progress} className="max-w-md" />
        </Section>

        <Section id="separator" title="Separator">
          <div className="flex h-5 items-center space-x-4 text-sm">
            <span>Blog</span>
            <Separator orientation="vertical" />
            <span>Docs</span>
            <Separator orientation="vertical" />
            <span>Source</span>
          </div>
        </Section>

        <Section id="kbd" title="Kbd">
          <p className="text-sm">
            Press <Kbd>Ctrl</Kbd> + <Kbd>K</Kbd> to open the command menu.
          </p>
        </Section>

        <Section id="aspect-ratio" title="AspectRatio">
          <AspectRatio ratio={16 / 9} className="bg-muted rounded-md max-w-md flex items-center justify-center">
            <span className="text-sm text-muted-foreground">16 : 9</span>
          </AspectRatio>
        </Section>

        <Section id="empty" title="Empty" blurb="Empty state with optional CTA action.">
          <Empty className="border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon"><Mail /></EmptyMedia>
              <EmptyTitle>No messages</EmptyTitle>
              <EmptyDescription>You're all caught up. New messages will appear here.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button size="sm"><Plus /> Compose message</Button>
            </EmptyContent>
          </Empty>
        </Section>

        {/* ── Navigation ────────────────────────────────── */}

        <Section id="tabs" title="Tabs" blurb="Radix Tabs — horizontal and vertical orientation.">
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Horizontal</p>
              <Tabs defaultValue="account">
                <TabsList>
                  <TabsTrigger value="account">Account</TabsTrigger>
                  <TabsTrigger value="password">Password</TabsTrigger>
                  <TabsTrigger value="team">Team</TabsTrigger>
                </TabsList>
                <TabsContent value="account" className="text-sm text-muted-foreground pt-3">Make changes to your account.</TabsContent>
                <TabsContent value="password" className="text-sm text-muted-foreground pt-3">Change your password.</TabsContent>
                <TabsContent value="team" className="text-sm text-muted-foreground pt-3">Manage your team.</TabsContent>
              </Tabs>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Vertical</p>
              <Tabs defaultValue="general" orientation="vertical" className="flex flex-row gap-3">
                <TabsList className="flex-col h-auto">
                  <TabsTrigger value="general" className="justify-start w-full">General</TabsTrigger>
                  <TabsTrigger value="security" className="justify-start w-full">Security</TabsTrigger>
                  <TabsTrigger value="billing" className="justify-start w-full">Billing</TabsTrigger>
                </TabsList>
                <div className="flex-1 text-sm text-muted-foreground">
                  <TabsContent value="general">General settings.</TabsContent>
                  <TabsContent value="security">Security settings.</TabsContent>
                  <TabsContent value="billing">Billing settings.</TabsContent>
                </div>
              </Tabs>
            </div>
          </div>
        </Section>

        <Section id="breadcrumb" title="Breadcrumb" blurb="Plain trail and collapsed-with-ellipsis.">
          <div className="space-y-3">
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem><BreadcrumbLink href="#">Home</BreadcrumbLink></BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem><BreadcrumbLink href="#">Components</BreadcrumbLink></BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem><BreadcrumbPage>Breadcrumb</BreadcrumbPage></BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem><BreadcrumbLink href="#">Home</BreadcrumbLink></BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem><BreadcrumbEllipsis /></BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem><BreadcrumbLink href="#">Components</BreadcrumbLink></BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem><BreadcrumbPage>Breadcrumb</BreadcrumbPage></BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </Section>

        <Section id="pagination" title="Pagination">
          <Pagination>
            <PaginationContent>
              <PaginationItem><PaginationPrevious href="#" /></PaginationItem>
              <PaginationItem><PaginationLink href="#">1</PaginationLink></PaginationItem>
              <PaginationItem><PaginationLink href="#" isActive>2</PaginationLink></PaginationItem>
              <PaginationItem><PaginationLink href="#">3</PaginationLink></PaginationItem>
              <PaginationItem><PaginationEllipsis /></PaginationItem>
              <PaginationItem><PaginationNext href="#" /></PaginationItem>
            </PaginationContent>
          </Pagination>
        </Section>

        <Section id="dropdown-menu" title="DropdownMenu" blurb="Items, labels, separators, shortcuts, checkboxes, radios, and submenus.">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">Open menu <ChevronDown className="ml-1 size-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56">
              <DropdownMenuLabel>My Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem><User /> Profile <DropdownMenuShortcut>⇧⌘P</DropdownMenuShortcut></DropdownMenuItem>
                <DropdownMenuItem><CreditCard /> Billing <DropdownMenuShortcut>⌘B</DropdownMenuShortcut></DropdownMenuItem>
                <DropdownMenuItem><Settings /> Settings <DropdownMenuShortcut>⌘,</DropdownMenuShortcut></DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>View</DropdownMenuLabel>
              <DropdownMenuCheckboxItem checked={showStatusBar} onCheckedChange={setShowStatusBar}>Status Bar</DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={showActivityBar} onCheckedChange={setShowActivityBar}>Activity Bar</DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem checked={showPanel} onCheckedChange={setShowPanel}>Panel</DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Panel position</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={menuPosition} onValueChange={setMenuPosition}>
                <DropdownMenuRadioItem value="top">Top</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="bottom">Bottom</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="right">Right</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuSub>
                <DropdownMenuSubTrigger><UserPlus /> Invite users</DropdownMenuSubTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuSubContent>
                    <DropdownMenuItem><Mail /> Email</DropdownMenuItem>
                    <DropdownMenuItem><MessageSquare /> Message</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem><Users /> More…</DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuPortal>
              </DropdownMenuSub>
              <DropdownMenuSeparator />
              <DropdownMenuItem><LifeBuoy /> Support</DropdownMenuItem>
              <DropdownMenuItem disabled><Cloud /> API <DropdownMenuShortcut>⌘K</DropdownMenuShortcut></DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem><LogOut /> Log out <DropdownMenuShortcut>⇧⌘Q</DropdownMenuShortcut></DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </Section>

        <Section id="context-menu" title="ContextMenu" blurb="Right-click the box. Same pattern as DropdownMenu — checkboxes, radios, submenus, shortcuts.">
          <ContextMenu>
            <ContextMenuTrigger className="flex h-32 w-full max-w-md items-center justify-center rounded-md border border-dashed border-border text-sm text-muted-foreground">
              Right-click here
            </ContextMenuTrigger>
            <ContextMenuContent className="w-56">
              <ContextMenuItem>Back <ContextMenuShortcut>⌘[</ContextMenuShortcut></ContextMenuItem>
              <ContextMenuItem disabled>Forward <ContextMenuShortcut>⌘]</ContextMenuShortcut></ContextMenuItem>
              <ContextMenuItem>Reload <ContextMenuShortcut>⌘R</ContextMenuShortcut></ContextMenuItem>
              <ContextMenuSub>
                <ContextMenuSubTrigger>More tools</ContextMenuSubTrigger>
                <ContextMenuSubContent>
                  <ContextMenuItem>Save Page As… <ContextMenuShortcut>⇧⌘S</ContextMenuShortcut></ContextMenuItem>
                  <ContextMenuItem>Create Shortcut…</ContextMenuItem>
                  <ContextMenuItem>Name Window…</ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem>Developer Tools</ContextMenuItem>
                </ContextMenuSubContent>
              </ContextMenuSub>
              <ContextMenuSeparator />
              <ContextMenuCheckboxItem checked={ctxBookmarks} onCheckedChange={setCtxBookmarks}>Show Bookmarks Bar <ContextMenuShortcut>⌘⇧B</ContextMenuShortcut></ContextMenuCheckboxItem>
              <ContextMenuCheckboxItem checked={ctxFullUrls} onCheckedChange={setCtxFullUrls}>Show Full URLs</ContextMenuCheckboxItem>
              <ContextMenuSeparator />
              <ContextMenuLabel>People</ContextMenuLabel>
              <ContextMenuRadioGroup value={ctxPerson} onValueChange={setCtxPerson}>
                <ContextMenuRadioItem value="pedro">Pedro Duarte</ContextMenuRadioItem>
                <ContextMenuRadioItem value="colm">Colm Tuite</ContextMenuRadioItem>
              </ContextMenuRadioGroup>
            </ContextMenuContent>
          </ContextMenu>
        </Section>

        <Section id="menubar" title="Menubar" blurb="Multiple menus with submenus, checkboxes, radios, shortcuts.">
          <Menubar>
            <MenubarMenu>
              <MenubarTrigger>File</MenubarTrigger>
              <MenubarContent>
                <MenubarItem>New Tab <MenubarShortcut>⌘T</MenubarShortcut></MenubarItem>
                <MenubarItem>New Window <MenubarShortcut>⌘N</MenubarShortcut></MenubarItem>
                <MenubarItem disabled>New Incognito Window</MenubarItem>
                <MenubarSeparator />
                <MenubarSub>
                  <MenubarSubTrigger>Share</MenubarSubTrigger>
                  <MenubarSubContent>
                    <MenubarItem>Email link</MenubarItem>
                    <MenubarItem>Messages</MenubarItem>
                    <MenubarItem>Notes</MenubarItem>
                  </MenubarSubContent>
                </MenubarSub>
                <MenubarSeparator />
                <MenubarItem>Print… <MenubarShortcut>⌘P</MenubarShortcut></MenubarItem>
              </MenubarContent>
            </MenubarMenu>
            <MenubarMenu>
              <MenubarTrigger>View</MenubarTrigger>
              <MenubarContent>
                <MenubarCheckboxItem checked={menubarVisible} onCheckedChange={setMenubarVisible}>Always Show Bookmarks Bar</MenubarCheckboxItem>
                <MenubarCheckboxItem>Always Show Full URLs</MenubarCheckboxItem>
                <MenubarSeparator />
                <MenubarItem inset>Reload <MenubarShortcut>⌘R</MenubarShortcut></MenubarItem>
                <MenubarItem disabled inset>Force Reload <MenubarShortcut>⇧⌘R</MenubarShortcut></MenubarItem>
              </MenubarContent>
            </MenubarMenu>
            <MenubarMenu>
              <MenubarTrigger>Profiles</MenubarTrigger>
              <MenubarContent>
                <MenubarRadioGroup value={menubarProfile} onValueChange={setMenubarProfile}>
                  <MenubarRadioItem value="andy">Andy</MenubarRadioItem>
                  <MenubarRadioItem value="benoit">Benoit</MenubarRadioItem>
                  <MenubarRadioItem value="luis">Luis</MenubarRadioItem>
                </MenubarRadioGroup>
                <MenubarSeparator />
                <MenubarItem inset>Edit…</MenubarItem>
                <MenubarItem inset>Add Profile…</MenubarItem>
              </MenubarContent>
            </MenubarMenu>
          </Menubar>
        </Section>

        <Section id="navigation-menu" title="NavigationMenu">
          <NavigationMenu>
            <NavigationMenuList>
              <NavigationMenuItem>
                <NavigationMenuTrigger>Getting started</NavigationMenuTrigger>
                <NavigationMenuContent>
                  <ul className="grid gap-2 p-3 w-[280px]">
                    <li><NavigationMenuLink className="text-sm">Introduction</NavigationMenuLink></li>
                    <li><NavigationMenuLink className="text-sm">Installation</NavigationMenuLink></li>
                    <li><NavigationMenuLink className="text-sm">Typography</NavigationMenuLink></li>
                  </ul>
                </NavigationMenuContent>
              </NavigationMenuItem>
            </NavigationMenuList>
          </NavigationMenu>
        </Section>

        {/* ── Overlays ──────────────────────────────────── */}

        <Section id="dialog" title="Dialog">
          <Dialog>
            <DialogTrigger asChild><Button variant="outline">Open dialog</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit profile</DialogTitle>
                <DialogDescription>Make changes to your profile here. Click save when done.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <Label htmlFor="dlg-name">Name</Label>
                <Input id="dlg-name" defaultValue="Pedro Duarte" />
              </div>
              <DialogFooter>
                <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                <Button>Save changes</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </Section>

        <Section id="alert-dialog" title="AlertDialog">
          <AlertDialog>
            <AlertDialogTrigger asChild><Button variant="destructive">Delete account</Button></AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. This will permanently delete your account.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction>Continue</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </Section>

        <Section id="sheet" title="Sheet" blurb="Slides in from any of the four sides.">
          <div className="flex flex-wrap gap-2">
            {(['top', 'right', 'bottom', 'left'] as const).map(side => (
              <Sheet key={side}>
                <SheetTrigger asChild><Button variant="outline" className="capitalize">From {side}</Button></SheetTrigger>
                <SheetContent side={side}>
                  <SheetHeader>
                    <SheetTitle className="capitalize">{side} sheet</SheetTitle>
                    <SheetDescription>Slides in from the {side}.</SheetDescription>
                  </SheetHeader>
                  <div className="p-4 space-y-3">
                    <Label htmlFor={`sheet-name-${side}`}>Name</Label>
                    <Input id={`sheet-name-${side}`} defaultValue="Pedro Duarte" />
                  </div>
                </SheetContent>
              </Sheet>
            ))}
          </div>
        </Section>

        <Section id="drawer" title="Drawer">
          <Drawer>
            <DrawerTrigger asChild><Button variant="outline">Open drawer</Button></DrawerTrigger>
            <DrawerContent>
              <DrawerHeader>
                <DrawerTitle>Move goal</DrawerTitle>
                <DrawerDescription>Set your daily activity goal.</DrawerDescription>
              </DrawerHeader>
              <div className="px-4 pb-4">
                <Slider defaultValue={[50]} max={100} step={1} />
              </div>
              <DrawerFooter>
                <Button>Submit</Button>
                <DrawerClose asChild><Button variant="outline">Cancel</Button></DrawerClose>
              </DrawerFooter>
            </DrawerContent>
          </Drawer>
        </Section>

        <Section id="popover" title="Popover">
          <Popover>
            <PopoverTrigger asChild><Button variant="outline">Open popover</Button></PopoverTrigger>
            <PopoverContent className="w-80">
              <div className="space-y-2">
                <h4 className="font-medium leading-none">Dimensions</h4>
                <p className="text-sm text-muted-foreground">Set the dimensions for the layer.</p>
              </div>
            </PopoverContent>
          </Popover>
        </Section>

        <Section id="tooltip" title="Tooltip">
          <Tooltip>
            <TooltipTrigger asChild><Button variant="outline" size="icon" aria-label="Star"><Star /></Button></TooltipTrigger>
            <TooltipContent>Add to favorites</TooltipContent>
          </Tooltip>
        </Section>

        <Section id="hover-card" title="HoverCard">
          <HoverCard>
            <HoverCardTrigger asChild><Button variant="link">@shadcn</Button></HoverCardTrigger>
            <HoverCardContent className="w-72">
              <div className="flex gap-3">
                <Avatar><AvatarFallback>SC</AvatarFallback></Avatar>
                <div className="text-sm">
                  <p className="font-medium">@shadcn</p>
                  <p className="text-muted-foreground">The React framework — created and maintained by @vercel.</p>
                </div>
              </div>
            </HoverCardContent>
          </HoverCard>
        </Section>

        <Section id="sonner" title="Sonner (toast)" blurb="Mounted at the app root in App.tsx — picks up theme tokens.">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => toast('Event has been created.')}>Default</Button>
            <Button variant="outline" onClick={() => toast.success('Saved!')}>Success</Button>
            <Button variant="outline" onClick={() => toast.error('Something broke')}>Error</Button>
            <Button variant="outline" onClick={() => toast.info('Heads up')}>Info</Button>
            <Button variant="outline" onClick={() => toast.warning('Be careful')}>Warning</Button>
            <Button variant="outline" onClick={() => toast.loading('Working…')}>Loading</Button>
          </div>
        </Section>

        {/* ── Containers ────────────────────────────────── */}

        <Section id="accordion" title="Accordion" blurb="Single (one open at a time, collapsible) and multiple (several open).">
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">type=&quot;single&quot;</p>
              <Accordion type="single" collapsible defaultValue="a">
                <AccordionItem value="a">
                  <AccordionTrigger>Is it accessible?</AccordionTrigger>
                  <AccordionContent>Yes. It adheres to the WAI-ARIA design pattern.</AccordionContent>
                </AccordionItem>
                <AccordionItem value="b">
                  <AccordionTrigger>Is it styled?</AccordionTrigger>
                  <AccordionContent>Yes. It comes with default styles.</AccordionContent>
                </AccordionItem>
                <AccordionItem value="c">
                  <AccordionTrigger>Is it animated?</AccordionTrigger>
                  <AccordionContent>Yes. With CSS variables.</AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">type=&quot;multiple&quot;</p>
              <Accordion type="multiple" defaultValue={['a', 'c']}>
                <AccordionItem value="a">
                  <AccordionTrigger>Item one</AccordionTrigger>
                  <AccordionContent>Both this and Item three start expanded.</AccordionContent>
                </AccordionItem>
                <AccordionItem value="b">
                  <AccordionTrigger>Item two</AccordionTrigger>
                  <AccordionContent>This one starts collapsed.</AccordionContent>
                </AccordionItem>
                <AccordionItem value="c">
                  <AccordionTrigger>Item three</AccordionTrigger>
                  <AccordionContent>Multi mode lets multiple items stay open at once.</AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          </div>
        </Section>

        <Section id="collapsible" title="Collapsible">
          <Collapsible className="max-w-md space-y-2">
            <CollapsibleTrigger asChild>
              <Button variant="outline" className="w-full justify-between">
                Recent searches <ChevronRight className="size-4" />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-1 text-sm text-muted-foreground pl-3">
              <div>buttons</div><div>radix</div><div>theming</div>
            </CollapsibleContent>
          </Collapsible>
        </Section>

        <Section id="scroll-area" title="ScrollArea" blurb="Vertical and horizontal.">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Vertical</p>
              <ScrollArea className="h-32 rounded-md border border-border p-3 text-sm">
                {Array.from({ length: 30 }, (_, i) => (
                  <div key={i}>Row #{i + 1}</div>
                ))}
              </ScrollArea>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Horizontal</p>
              <ScrollArea className="rounded-md border border-border whitespace-nowrap">
                <div className="flex gap-3 p-3">
                  {Array.from({ length: 20 }, (_, i) => (
                    <div key={i} className="size-20 shrink-0 rounded-md bg-muted flex items-center justify-center text-sm font-medium">
                      #{i + 1}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </div>
        </Section>

        <Section id="resizable" title="Resizable" blurb="Horizontal, vertical, and nested panels.">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Horizontal</p>
              <ResizablePanelGroup orientation="horizontal" className="rounded-md border border-border h-32">
                <ResizablePanel defaultSize={50}><div className="p-3 text-sm">Left</div></ResizablePanel>
                <ResizableHandle withHandle />
                <ResizablePanel defaultSize={50}><div className="p-3 text-sm">Right</div></ResizablePanel>
              </ResizablePanelGroup>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Vertical (with nested split)</p>
              <ResizablePanelGroup orientation="vertical" className="rounded-md border border-border h-48">
                <ResizablePanel defaultSize={40}><div className="p-3 text-sm">Top</div></ResizablePanel>
                <ResizableHandle withHandle />
                <ResizablePanel defaultSize={60}>
                  <ResizablePanelGroup orientation="horizontal">
                    <ResizablePanel defaultSize={50}><div className="p-3 text-sm">Bottom-left</div></ResizablePanel>
                    <ResizableHandle withHandle />
                    <ResizablePanel defaultSize={50}><div className="p-3 text-sm">Bottom-right</div></ResizablePanel>
                  </ResizablePanelGroup>
                </ResizablePanel>
              </ResizablePanelGroup>
            </div>
          </div>
        </Section>

        <Section id="carousel" title="Carousel">
          <Carousel className="max-w-xs">
            <CarouselContent>
              {[1, 2, 3, 4, 5].map(n => (
                <CarouselItem key={n}>
                  <div className="aspect-square bg-muted rounded-md flex items-center justify-center text-3xl font-bold text-muted-foreground">
                    {n}
                  </div>
                </CarouselItem>
              ))}
            </CarouselContent>
            <CarouselPrevious />
            <CarouselNext />
          </Carousel>
        </Section>

        <Section id="table" title="Table">
          <Table>
            <TableCaption>Recent invoices.</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Method</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow><TableCell>INV001</TableCell><TableCell><Badge>Paid</Badge></TableCell><TableCell>Card</TableCell><TableCell className="text-right">$250.00</TableCell></TableRow>
              <TableRow><TableCell>INV002</TableCell><TableCell><Badge variant="secondary">Pending</Badge></TableCell><TableCell>PayPal</TableCell><TableCell className="text-right">$150.00</TableCell></TableRow>
              <TableRow><TableCell>INV003</TableCell><TableCell><Badge variant="destructive">Failed</Badge></TableCell><TableCell>Card</TableCell><TableCell className="text-right">$ 75.00</TableCell></TableRow>
            </TableBody>
          </Table>
        </Section>

        <Section id="item" title="Item" blurb="List item primitive — title + description + media.">
          <div className="space-y-2 max-w-md">
            <Item>
              <ItemMedia><Avatar><AvatarFallback>JD</AvatarFallback></Avatar></ItemMedia>
              <ItemContent>
                <ItemTitle>Jane Doe</ItemTitle>
                <ItemDescription>Project lead</ItemDescription>
              </ItemContent>
            </Item>
            <Item>
              <ItemMedia><Mail /></ItemMedia>
              <ItemContent>
                <ItemTitle>Inbox</ItemTitle>
                <ItemDescription>3 unread messages</ItemDescription>
              </ItemContent>
            </Item>
          </div>
        </Section>

        {/* ── Data ──────────────────────────────────────── */}

        <Section id="calendar" title="Calendar" blurb="Single date, date range, and multiple-date modes.">
          <div className="grid gap-6 md:grid-cols-3">
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Single</p>
              <Calendar mode="single" selected={date} onSelect={setDate} className="rounded-md border border-border" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Range</p>
              <Calendar
                mode="range"
                selected={dateRange}
                onSelect={(r) => setDateRange(r?.from ? { from: r.from, to: r.to } : undefined)}
                numberOfMonths={1}
                className="rounded-md border border-border"
              />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Multiple</p>
              <Calendar
                mode="multiple"
                selected={multiDates}
                onSelect={(d) => setMultiDates(d ?? [])}
                className="rounded-md border border-border"
              />
            </div>
          </div>
        </Section>

        <Section id="chart" title="Chart" blurb="Recharts wrapper — full demo lands in Phase 4 alongside --chart-* wiring.">
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <CalendarIcon className="size-4" /> Phase 4 wires <code>--chart-*</code> tokens to a real Recharts demo.
          </p>
        </Section>

        <Separator />

        <p className="text-xs text-muted-foreground">
          Components on disk: 50. Demo coverage: every primitive above. Theme switches in 🎨 Settings should re-color every section without breaking layout.
        </p>
      </div>
    </TooltipProvider>
  )
}
