import { useEffect, useState } from 'react'
import { signalReady } from '@shared/api/bridge'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Select } from '@shared/components/ui/select'

// Import docs as raw strings — Vite handles this with ?raw
import readme from '../../../../README.md?raw'
import gettingStarted from '../../../../docs/for-humans/01-getting-started.md?raw'
import architecture from '../../../../docs/for-humans/02-architecture.md?raw'
import tutorial from '../../../../docs/for-humans/03-tutorial.md?raw'
import testing from '../../../../docs/for-humans/04-testing.md?raw'

const docs = [
  { value: 'readme', label: 'README', content: readme },
  { value: 'getting-started', label: 'Getting Started', content: gettingStarted },
  { value: 'architecture', label: 'Architecture', content: architecture },
  { value: 'tutorial', label: 'Tutorial', content: tutorial },
  { value: 'testing', label: 'Testing', content: testing },
]

export default function App() {
  const [selectedDoc, setSelectedDoc] = useState('readme')

  useEffect(() => { signalReady() }, [])

  const doc = docs.find(d => d.value === selectedDoc) ?? docs[0]

  return (
    <div className="docs">
      <div className="docs-header">
        <h1>{import.meta.env.VITE_APP_NAME || 'App'}</h1>
        <Select
          value={selectedDoc}
          onChange={setSelectedDoc}
          options={docs}
          className="doc-select"
        />
      </div>
      <div className="markdown-body">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{doc.content}</ReactMarkdown>
      </div>
    </div>
  )
}
