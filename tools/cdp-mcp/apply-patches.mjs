// Applies the playwright-core patch after install.
// Needed because cdp-mcp has its own playwright-core in node_modules/
// that doesn't get the root-level bun patch.
import { readFileSync, writeFileSync } from "fs"

const file = "node_modules/playwright-core/lib/server/chromium/crBrowser.js"
let src = readFileSync(file, "utf8")

if (src.includes(".catch(() => {})")) {
  console.log("playwright-core already patched")
} else {
  src = src.replace("}));\n    }\n    await Promise.all(promises);", "}).catch(() => {}));\n    }\n    await Promise.all(promises);")
  writeFileSync(file, src)
  console.log("patched playwright-core (Browser.setDownloadBehavior .catch)")
}
