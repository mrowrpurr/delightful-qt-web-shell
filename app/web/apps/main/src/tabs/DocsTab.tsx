import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@shared/components/ui/select'
import { Switch } from '@shared/components/ui/switch'
import { Label } from '@shared/components/ui/label'

// ── Human docs ────────────────────────────────────────────
import readme from '../../../../../README.md?raw'
import humanGettingStarted from '../../../../../docs/DelightfulQtWebShell/for-humans/01-getting-started.md?raw'
import humanArchitecture from '../../../../../docs/DelightfulQtWebShell/for-humans/02-architecture.md?raw'
import humanTutorial from '../../../../../docs/DelightfulQtWebShell/for-humans/03-tutorial.md?raw'
import humanTesting from '../../../../../docs/DelightfulQtWebShell/for-humans/04-testing.md?raw'
import humanTools from '../../../../../docs/DelightfulQtWebShell/for-humans/05-tools.md?raw'
import humanGotchas from '../../../../../docs/DelightfulQtWebShell/for-humans/06-gotchas.md?raw'
import humanDesktopCapabilities from '../../../../../docs/DelightfulQtWebShell/for-humans/07-desktop-capabilities.md?raw'
import humanTheming from '../../../../../docs/DelightfulQtWebShell/for-humans/08-theming.md?raw'

// ── Agent docs ────────────────────────────────────────────
import agentGettingStarted from '../../../../../docs/DelightfulQtWebShell/for-agents/01-getting-started.md?raw'
import agentArchitecture from '../../../../../docs/DelightfulQtWebShell/for-agents/02-architecture.md?raw'
import agentAddingFeatures from '../../../../../docs/DelightfulQtWebShell/for-agents/03-adding-features.md?raw'
import agentTesting from '../../../../../docs/DelightfulQtWebShell/for-agents/04-testing.md?raw'
import agentTools from '../../../../../docs/DelightfulQtWebShell/for-agents/05-tools.md?raw'
import agentGotchas from '../../../../../docs/DelightfulQtWebShell/for-agents/06-gotchas.md?raw'
import agentDesktopCapabilities from '../../../../../docs/DelightfulQtWebShell/for-agents/07-desktop-capabilities.md?raw'
import agentTheming from '../../../../../docs/DelightfulQtWebShell/for-agents/08-theming.md?raw'

const humanDocs = [
  { value: 'readme', label: 'README', content: readme },
  { value: 'getting-started', label: '01 — Getting Started', content: humanGettingStarted },
  { value: 'architecture', label: '02 — Architecture', content: humanArchitecture },
  { value: 'tutorial', label: '03 — Tutorial', content: humanTutorial },
  { value: 'testing', label: '04 — Testing', content: humanTesting },
  { value: 'tools', label: '05 — Tools', content: humanTools },
  { value: 'gotchas', label: '06 — Gotchas', content: humanGotchas },
  { value: 'desktop-capabilities', label: '07 — Desktop Capabilities', content: humanDesktopCapabilities },
  { value: 'theming', label: '08 — Theming', content: humanTheming },
]

const agentDocs = [
  { value: 'readme', label: 'README', content: readme },
  { value: 'getting-started', label: '01 — Getting Started', content: agentGettingStarted },
  { value: 'architecture', label: '02 — Architecture', content: agentArchitecture },
  { value: 'adding-features', label: '03 — Adding Features', content: agentAddingFeatures },
  { value: 'testing', label: '04 — Testing', content: agentTesting },
  { value: 'tools', label: '05 — Tools', content: agentTools },
  { value: 'gotchas', label: '06 — Gotchas', content: agentGotchas },
  { value: 'desktop-capabilities', label: '07 — Desktop Capabilities', content: agentDesktopCapabilities },
  { value: 'theming', label: '08 — Theming', content: agentTheming },
]

export default function DocsTab() {
  const [agentMode, setAgentMode] = useState(false)
  const [selectedDoc, setSelectedDoc] = useState('readme')

  const docs = agentMode ? agentDocs : humanDocs
  const doc = docs.find(d => d.value === selectedDoc) ?? docs[0]

  // Reset to readme if current selection doesn't exist in the new doc set
  const handleToggle = (newMode: boolean) => {
    const newDocs = newMode ? agentDocs : humanDocs
    if (!newDocs.find(d => d.value === selectedDoc)) {
      setSelectedDoc('readme')
    }
    setAgentMode(newMode)
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-border">
        <h2 className="text-lg font-semibold text-primary">Documentation</h2>
        <div className="flex items-center gap-4">
          {/* Agent/Human toggle */}
          <Label htmlFor="docs-mode-switch" className="font-normal">
            <span className="text-xs text-muted-foreground">{agentMode ? '🤖 Agent' : '👤 Human'}</span>
            <Switch id="docs-mode-switch" checked={agentMode} onCheckedChange={handleToggle} size="sm" />
          </Label>

          <Select value={selectedDoc} onValueChange={setSelectedDoc}>
            <SelectTrigger className="w-[240px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {docs.map(d => (
                <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="markdown-body">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{doc.content}</ReactMarkdown>
      </div>
    </div>
  )
}
