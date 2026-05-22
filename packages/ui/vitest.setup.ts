import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// Unmount React trees after every test so DOM state never leaks between cases.
afterEach(() => {
  cleanup()
})
