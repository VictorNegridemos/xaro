// Test-only: lets node:test + tsx load components that import *.module.scss. Each class name resolves to
// its own key. Import this module before any component in a *.test.tsx file. Never imported by app code.
import Module from 'node:module'

type Loader = (module: { exports: unknown }, filename: string) => void
const extensions = (Module as unknown as { _extensions: Record<string, Loader> })._extensions

if (!extensions['.scss']) {
  extensions['.scss'] = (module) => {
    module.exports = new Proxy({}, {
      get: (_target, key) => (typeof key === 'string' && key !== '__esModule' ? key : undefined),
    })
  }
}
