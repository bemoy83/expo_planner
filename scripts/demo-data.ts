// Writes the invented test files (`src/demo/demoData.ts`) to demo_data/, to read into the app by hand.
import { mkdirSync, writeFileSync } from 'node:fs'
import { demoFiles } from '../src/demo/demoData.ts'

const DIR = 'demo_data'
mkdirSync(DIR, { recursive: true })
for (const file of demoFiles()) {
  writeFileSync(`${DIR}/${file.name}`, file.bytes)
  console.log(`${DIR}/${file.name}`)
}
