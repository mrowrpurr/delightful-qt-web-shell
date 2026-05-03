import { Switch } from '@app/ui/components/switch'
import { Label } from '@app/ui/components/label'

export function DarkModeToggle({ checked, onChange }: {
  checked: boolean
  onChange: (dark: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between">
      <Label htmlFor="dark-mode-switch" className="flex-col items-start gap-1">
        <span className="font-medium">Dark Mode</span>
        <span className="font-normal text-muted-foreground">Toggle between light and dark themes</span>
      </Label>
      <Switch id="dark-mode-switch" checked={checked} onCheckedChange={onChange} />
    </div>
  )
}
