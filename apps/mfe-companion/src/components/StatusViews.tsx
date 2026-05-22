import { Button, Card, CardContent } from '@40kauspex/ui'

/** Centred loading message shown while companion data is in flight. */
export function LoadingView({ label = 'Loading…' }: { label?: string }) {
  return (
    <p className="py-12 text-center text-sm text-muted-foreground">{label}</p>
  )
}

/** Error card with an optional retry action. */
export function ErrorView({
  message,
  onRetry,
}: {
  message: string
  onRetry?: () => void
}) {
  return (
    <Card role="alert" className="mx-auto max-w-md border-destructive/40">
      <CardContent className="space-y-3 p-6 text-center">
        <p className="text-sm font-medium text-destructive">
          Something went wrong
        </p>
        <p className="text-sm text-muted-foreground">{message}</p>
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            Try again
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

/** A neutral keyword chip (faction/unit/phase keywords). */
export function KeywordChip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded bg-secondary px-1.5 py-0.5 text-xs font-medium text-secondary-foreground">
      {label}
    </span>
  )
}

/** A highlighted keyword chip — a unit keyword that matched the active phase. */
export function MatchedKeywordChip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded bg-primary/15 px-1.5 py-0.5 text-xs font-semibold text-primary ring-1 ring-primary/30">
      {label}
    </span>
  )
}
