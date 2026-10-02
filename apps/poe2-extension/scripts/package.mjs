import { execFileSync } from 'node:child_process'
import { mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { check } from './check.mjs'

const { root, dist, version } = await check()
const output = path.join(root, 'artifacts', `poe2-extension-${version}.zip`)
await mkdir(path.dirname(output), { recursive: true })
await rm(output, { force: true })
execFileSync('zip', ['-q', '-r', output, '.'], { cwd: dist, stdio: 'inherit' })
console.log(output)
