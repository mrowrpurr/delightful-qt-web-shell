import { useEffect, useState, useCallback } from 'react'
import { getBridge } from '@shared/api/bridge'
import type { SystemBridge } from '@shared/api/system-bridge'
import { Button } from '@shared/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@shared/components/ui/card'

const system = await getBridge<SystemBridge>('system')

export default function SystemTab() {
  const [droppedFiles, setDroppedFiles] = useState<string[]>([])
  const [receivedArgs, setReceivedArgs] = useState<string[]>([])
  const [clipboardText, setClipboardText] = useState('')
  const [copyFeedback, setCopyFeedback] = useState('')

  useEffect(() => {
    return system.filesDropped(async () => {
      setDroppedFiles(await system.getDroppedFiles())
    })
  }, [])

  useEffect(() => {
    system.getReceivedArgs().then(args => {
      if (args.length > 0) setReceivedArgs(args)
    })
    return system.argsReceived(async () => {
      setReceivedArgs(await system.getReceivedArgs())
    })
  }, [])

  const handleCopy = useCallback(async () => {
    const now = new Date().toLocaleString()
    await system.copyToClipboard({ text: `[Clipboard Test] ${now}` })
    setCopyFeedback('Copied!')
    setTimeout(() => setCopyFeedback(''), 2000)
  }, [])

  const handleRead = useCallback(async () => {
    const result = await system.readClipboard()
    setClipboardText(result.text)
  }, [])

  return (
    <div className="max-w-2xl mx-auto p-6 flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-primary mb-1">System Bridge</h2>
        <p className="text-sm text-muted-foreground">Desktop capabilities — clipboard, drag & drop, CLI args, URL protocol. All via the built-in SystemBridge.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">📋 Clipboard</CardTitle>
          <CardDescription>Read and write the system clipboard from React.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <div className="flex gap-2">
            <Button size="sm" onClick={handleCopy}>Copy timestamp</Button>
            <Button size="sm" variant="outline" onClick={handleRead}>Read clipboard</Button>
            {copyFeedback && <span className="text-sm text-primary self-center">{copyFeedback}</span>}
          </div>
          {clipboardText && (
            <pre className="text-xs font-mono text-muted-foreground bg-muted p-2 rounded break-all whitespace-pre-wrap">{clipboardText}</pre>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">📦 Drag & Drop</CardTitle>
          <CardDescription>Drop files from your OS onto this window. Paths arrive via the <code className="text-xs">filesDropped</code> signal.</CardDescription>
        </CardHeader>
        <CardContent>
          {droppedFiles.length > 0 ? (
            <div className="flex flex-col gap-1" data-testid="dropped-files">
              {droppedFiles.map((file, i) => (
                <div key={i} className="text-xs font-mono text-muted-foreground break-all">{file}</div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Drop files here to see their paths.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">🚀 CLI Args & URL Protocol</CardTitle>
          <CardDescription>
            Launch with args or click a <code className="text-xs">{import.meta.env.VITE_APP_SLUG || 'your-app'}://</code> link.
            Second instances forward args to the running app.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {receivedArgs.length > 0 ? (
            <div className="flex flex-col gap-1" data-testid="received-args">
              {receivedArgs.map((arg, i) => (
                <div key={i} className="text-xs font-mono text-muted-foreground break-all">{arg}</div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No args received. Try launching the exe with arguments.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
