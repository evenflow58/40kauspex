// Test-only stub for the federated remote `mfe_companion/App`.
//
// At runtime the shell loads this component over Module Federation, but that
// remote is only resolvable from a built remote. Vite's static import-analysis
// runs BEFORE vi.mock() takes effect, so it needs a real module to resolve to.
// `apps/shell/vitest.config.ts` aliases `mfe_companion/App` to this file.
export default function MfeCompanionStub() {
  return <div data-testid="remote-companion">Mocked remote companion</div>
}
