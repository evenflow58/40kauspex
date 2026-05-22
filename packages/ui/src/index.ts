// Shared UI component library.
// shadcn/ui components live in src/components/ui and are re-exported here so
// apps can import them from `@40kauspex/ui`.

export { cn } from './lib/utils'

export { Button, buttonVariants } from './components/ui/button'
export type { ButtonProps } from './components/ui/button'

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
} from './components/ui/card'
