import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { Button, buttonVariants } from './button'

describe('Button', () => {
  it('renders its children inside a native button element', () => {
    render(<Button>Click me</Button>)
    const button = screen.getByRole('button', { name: 'Click me' })
    expect(button).toBeInTheDocument()
    expect(button.tagName).toBe('BUTTON')
  })

  it('applies the default variant and size classes', () => {
    render(<Button>Default</Button>)
    const button = screen.getByRole('button', { name: 'Default' })
    // default variant
    expect(button).toHaveClass('bg-primary')
    // default size
    expect(button).toHaveClass('h-9')
  })

  it('applies variant-specific classes when a variant is given', () => {
    render(<Button variant="destructive">Delete</Button>)
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveClass(
      'bg-destructive'
    )
  })

  it('applies size-specific classes when a size is given', () => {
    render(
      <Button size="sm">Small</Button>
    )
    expect(screen.getByRole('button', { name: 'Small' })).toHaveClass('h-8')
  })

  it('merges a caller-supplied className with the variant classes', () => {
    render(<Button className="custom-class">Styled</Button>)
    const button = screen.getByRole('button', { name: 'Styled' })
    expect(button).toHaveClass('custom-class')
    expect(button).toHaveClass('bg-primary')
  })

  it('fires onClick when clicked', async () => {
    const user = userEvent.setup()
    const handleClick = vi.fn()
    render(<Button onClick={handleClick}>Press</Button>)

    await user.click(screen.getByRole('button', { name: 'Press' }))

    expect(handleClick).toHaveBeenCalledTimes(1)
  })

  it('does not fire onClick when disabled', async () => {
    const user = userEvent.setup()
    const handleClick = vi.fn()
    render(
      <Button disabled onClick={handleClick}>
        Disabled
      </Button>
    )

    const button = screen.getByRole('button', { name: 'Disabled' })
    expect(button).toBeDisabled()
    await user.click(button)

    expect(handleClick).not.toHaveBeenCalled()
  })

  it('renders as its child element when asChild is true', () => {
    render(
      <Button asChild>
        <a href="/home">Home link</a>
      </Button>
    )
    const link = screen.getByRole('link', { name: 'Home link' })
    expect(link).toBeInTheDocument()
    expect(link.tagName).toBe('A')
    expect(link).toHaveAttribute('href', '/home')
    // The Slot still applies the button variant classes to the child.
    expect(link).toHaveClass('bg-primary')
    // No native <button> should be rendered.
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('forwards a ref to the underlying button element', () => {
    const ref = { current: null as HTMLButtonElement | null }
    render(<Button ref={ref}>With ref</Button>)
    expect(ref.current).toBeInstanceOf(HTMLButtonElement)
  })

  it('exposes a buttonVariants helper that produces class strings', () => {
    const classes = buttonVariants({ variant: 'outline', size: 'lg' })
    expect(classes).toContain('border')
    expect(classes).toContain('h-10')
  })
})
