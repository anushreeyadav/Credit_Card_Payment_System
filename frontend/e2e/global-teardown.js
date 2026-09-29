import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Drop the throwaway e2e database after the run.
export default function globalTeardown() {
  const here = path.dirname(fileURLToPath(import.meta.url))
  const python = path.resolve(here, '../../backend/django_backend/venv/Scripts/python.exe')
  execFileSync(python, [path.join(here, 'django_test_server.py'), '--drop'], { stdio: 'inherit' })
}
