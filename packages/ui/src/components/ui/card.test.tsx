import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from './card'

describe('Card', () => {
  it('renders children passed to the root Card', () => {
    render(<Card>Card body</Card>)
    expect(screen.getByText('Card body')).toBeInTheDocument()
  })

  it('applies the base card classes to the root element', () => {
    render(<Card data-testid="card">content</Card>)
    const card = screen.getByTestId('card')
    expect(card).toHaveClass('rounded-xl')
    expect(card).toHaveClass('border')
    expect(card).toHaveClass('bg-card')
  })

  it('merges a caller-supplied className onto the root', () => {
    render(
      <Card data-testid="card" className="max-w-xl">
        content
      </Card>
    )
    const card = screen.getByTestId('card')
    expect(card).toHaveClass('max-w-xl')
    expect(card).toHaveClass('rounded-xl')
  })

  it('renders the full header / content / footer structure', () => {
    render(
      <Card data-testid="card">
        <CardHeader data-testid="header">
          <CardTitle>Home</CardTitle>
          <CardDescription>A description</CardDescription>
        </CardHeader>
        <CardContent data-testid="content">
          <p>Main content</p>
        </CardContent>
        <CardFooter data-testid="footer">
          <button type="button">Action</button>
        </CardFooter>
      </Card>
    )

    expect(screen.getByText('Home')).toBeInTheDocument()
    expect(screen.getByText('A description')).toBeInTheDocument()
    expect(screen.getByText('Main content')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Action' })
    ).toBeInTheDocument()

    // Header / content / footer are all descendants of the root card.
    const card = screen.getByTestId('card')
    expect(card).toContainElement(screen.getByTestId('header'))
    expect(card).toContainElement(screen.getByTestId('content'))
    expect(card).toContainElement(screen.getByTestId('footer'))
  })

  it('renders CardTitle with the title styling classes', () => {
    render(<CardTitle data-testid="title">Title text</CardTitle>)
    const title = screen.getByTestId('title')
    expect(title).toHaveTextContent('Title text')
    expect(title).toHaveClass('font-semibold')
  })

  it('forwards a ref to the underlying div', () => {
    const ref = { current: null as HTMLDivElement | null }
    render(<Card ref={ref}>ref card</Card>)
    expect(ref.current).toBeInstanceOf(HTMLDivElement)
  })
})
