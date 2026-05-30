import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  LoadingView,
  ErrorView,
  KeywordChip,
  MatchedKeywordChip,
} from './StatusViews'

describe('LoadingView', () => {
  it('renders the default label', () => {
    render(<LoadingView />)
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  it('renders a custom label', () => {
    render(<LoadingView label="Loading games…" />)
    expect(screen.getByText('Loading games…')).toBeInTheDocument()
  })
})

describe('ErrorView', () => {
  it('renders the error message', () => {
    render(<ErrorView message="Something failed" />)
    expect(screen.getByText('Something failed')).toBeInTheDocument()
  })

  it('has the correct alert role', () => {
    render(<ErrorView message="Error occurred" />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('renders the retry button when onRetry is provided', () => {
    render(<ErrorView message="Failed" onRetry={vi.fn()} />)
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
  })

  it('calls onRetry when the retry button is clicked', async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    render(<ErrorView message="Failed" onRetry={onRetry} />)
    await user.click(screen.getByRole('button', { name: /try again/i }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('does not render the retry button when onRetry is not provided', () => {
    render(<ErrorView message="Failed" />)
    expect(
      screen.queryByRole('button', { name: /try again/i })
    ).not.toBeInTheDocument()
  })
})

describe('KeywordChip', () => {
  it('renders the label text', () => {
    render(<KeywordChip label="INFANTRY" />)
    expect(screen.getByText('INFANTRY')).toBeInTheDocument()
  })
})

describe('MatchedKeywordChip', () => {
  it('renders the label text', () => {
    render(<MatchedKeywordChip label="FLY" />)
    expect(screen.getByText('FLY')).toBeInTheDocument()
  })
})
