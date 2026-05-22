import { describe, it, expect } from 'vitest'
import { cn } from './utils'

describe('cn', () => {
  it('merges multiple class name strings into one', () => {
    expect(cn('px-2', 'py-1')).toBe('px-2 py-1')
  })

  it('drops falsy values (false, null, undefined)', () => {
    expect(cn('text-sm', false, null, undefined, 'font-medium')).toBe(
      'text-sm font-medium'
    )
  })

  it('resolves conditional object syntax from clsx', () => {
    expect(cn('base', { active: true, hidden: false })).toBe('base active')
  })

  it('flattens nested arrays of class values', () => {
    expect(cn(['flex', ['items-center', 'gap-2']])).toBe(
      'flex items-center gap-2'
    )
  })

  it('de-duplicates conflicting Tailwind utilities, keeping the last', () => {
    // tailwind-merge behaviour: a later padding utility wins over an earlier one.
    expect(cn('px-2 px-4')).toBe('px-4')
  })

  it('keeps the last conflicting class when merging across arguments', () => {
    expect(cn('bg-red-500', 'bg-blue-500')).toBe('bg-blue-500')
  })

  it('does not merge non-conflicting utilities from the same group family', () => {
    // px and py are different axes — both should survive.
    expect(cn('px-4 py-2')).toBe('px-4 py-2')
  })

  it('returns an empty string when given no arguments', () => {
    expect(cn()).toBe('')
  })
})
