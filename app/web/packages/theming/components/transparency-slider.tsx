export function TransparencySlider({ label, description, value, onChange }: {
  label: string
  description: string
  value: number
  onChange: (value: number) => void
}) {
  return (
    <div>
      <p className="text-sm font-medium mb-1">{label}</p>
      <p className="text-sm text-muted-foreground mb-3">{description}</p>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={100}
          value={value}
          onChange={e => onChange(parseInt(e.target.value, 10))}
          className="flex-1 accent-primary"
        />
        <span className="text-sm text-muted-foreground tabular-nums w-10 text-right">{value}%</span>
      </div>
    </div>
  )
}
