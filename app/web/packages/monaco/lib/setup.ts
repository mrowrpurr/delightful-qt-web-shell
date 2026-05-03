// Monaco setup — share a single instance between @monaco-editor/react and monaco-vim.
// The web worker must be configured before any editor mounts.
// Import this module as a side-effect at app entry, before anything that mounts an editor.
import * as monaco from 'monaco-editor'
import { loader } from '@monaco-editor/react'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'

self.MonacoEnvironment = { getWorker: () => new editorWorker() }
loader.config({ monaco })
