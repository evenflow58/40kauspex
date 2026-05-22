import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@40kauspex/ui'

export default function App() {
  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>Home</CardTitle>
        <CardDescription>
          Served by the mfe-home micro-frontend (port 3001).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          This card is rendered inside the federated remote and styled with
          Tailwind CSS v4 and shadcn/ui components from{' '}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
            @40kauspex/ui
          </code>
          .
        </p>
      </CardContent>
      <CardFooter>
        <Button>Get started</Button>
      </CardFooter>
    </Card>
  )
}
