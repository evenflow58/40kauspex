// Test-only stub for the federated remote `mfe_home/App`.
//
// At runtime the shell loads this component over Module Federation, but that
// remote is only resolvable from a built remote. Vite's static import-analysis
// runs BEFORE vi.mock() takes effect, so it needs a real module to resolve to.
// `apps/shell/vitest.config.ts` aliases `mfe_home/App` to this file. Tests that
// care about the remote's rendered output override it further with vi.mock().
export default function MfeHomeStub() {
  return <div data-testid="remote-home">Mocked remote home</div>
}
