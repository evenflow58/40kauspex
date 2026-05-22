# ADR: Authentication — Google Login (multi-provider ready)

- **Status**: Proposed
- **Date**: 2026-05-22
- **Author**: Architect agent
- **Context**: Add Google login to 40K Auspex. Login page in the shell, gated
  before main content. Designed so additional providers (Apple, Microsoft,
  email/password) can be added later without re-architecting.

---

## 1. Summary of decisions

| # | Question | Decision |
|---|----------|----------|
| 1 | Auth service | **Cognito User Pool** with Google as a federated identity provider (IdP) |
| 2 | OAuth flow | **Authorization Code + PKCE** against Cognito's OAuth endpoints, via the Cognito **Hosted UI** for the IdP hand-off |
| 3 | Frontend config delivery | Generated **`auth-config.json`** fetched at runtime from CloudFront; written by the deploy step from CDK stack outputs (mirrors the existing `envFromCfnOutputs` pattern) |
| 4 | Google Client Secret storage | **AWS Secrets Manager**, referenced by the `AuthStack` at deploy time; never in git, CDK source, or the frontend bundle |
| 5 | CDK structure | New **`AuthStack`**, deployed inside the existing `AppStage`; the `Hosting` construct gains the per-environment callback URLs |
| 6 | Frontend library | **`oidc-client-ts`** wrapped in a small `@40kauspex/auth` package |
| 7 | Ephemeral PR envs | Each PR env's `AuthStack` creates its **own User Pool app client** with that PR's CloudFront callback URLs; the User Pool itself is shared |

---

## 2. Decision detail and rationale

### 2.1 Auth service — Cognito User Pool + Google IdP

**Decision.** Use a single Cognito User Pool. Configure Google as a federated
identity provider on that pool. Users authenticate with Google; Cognito mints
its own JWTs (ID + access token) for the app.

**Rationale.**
- Native AWS service — no third-party billing, no extra vendor, integrates
  with API Gateway authorizers and IAM when the backend lands.
- Adding providers later is a configuration change: add an `IUserPoolIdentityProvider`
  (Apple, Microsoft/OIDC, SAML) and list it in the app client's
  `supportedIdentityProviders`. The frontend and token-handling code do **not**
  change — Cognito normalises every provider into the same JWT shape.
- Email/password ("Cognito native") can be enabled on the same pool later
  with zero migration.

**Trade-offs considered.**
- *Auth0 / Clerk* — faster to wire up, better DX, but adds a vendor + cost and
  duplicates an AWS-native capability. Rejected: the project is explicitly
  AWS-CDK-centric.
- *Raw Google OAuth, no Cognito* — the app would consume Google tokens
  directly. Rejected: every new provider would need bespoke token handling,
  and there is no AWS-native way to authorize API Gateway with a raw Google
  token without a custom Lambda authorizer. Cognito is the normalisation layer.

**Pool configuration.**
- One User Pool, one **app client per environment** (prod + one per PR).
- App client is a **public client** (SPA): no client secret, PKCE required.
- `OAuthFlow`: authorization code grant only (no implicit).
- Token validity: ID/access token 60 min, refresh token 30 days (revisit).
- Standard attributes mapped from Google: `email`, `name`, `picture`.
- Cognito domain: a **prefix domain** (e.g. `auspex40k-auth.auth.us-east-1.amazoncognito.com`).
  Custom domain deferred until the app has a custom domain of its own.

### 2.2 OAuth flow — Authorization Code + PKCE via Hosted UI

**Decision.** The browser runs the Authorization Code flow with PKCE. The
"Sign in with Google" button redirects to the Cognito **Hosted UI**
`/oauth2/authorize` endpoint with `identity_provider=Google`, which immediately
forwards to Google. After consent the user returns to a `/auth/callback` route
in the shell with a `code`, which `oidc-client-ts` exchanges for tokens at
Cognito's `/oauth2/token` endpoint.

**Rationale.**
- PKCE with a public client means **no client secret in the browser** — the
  only correct flow for a SPA.
- Using Cognito's Hosted UI endpoints (not a hand-rolled Google redirect)
  keeps Cognito as the single broker. With `identity_provider=Google` set,
  the user never sees a Cognito-branded screen — they go straight to Google,
  so the "custom login page" requirement is still met (our React page renders
  the branded button; the redirect is invisible plumbing).
- Adding a provider later = add another button that sets a different
  `identity_provider` value. No new flow.

**Trade-offs considered.**
- *Hosted UI as the actual login screen* — least code, but we cannot brand it
  to match the shadcn/Tailwind design system. Rejected for UX; we still use
  its `/authorize` and `/token` **endpoints**, just not its rendered page.
- *Implicit flow* — deprecated by OAuth 2.1, leaks tokens in URL fragments.
  Rejected.

**Why not a Lambda-backed token exchange.** A confidential-client backend
exchange (secret server-side) is more secure for refresh-token storage, but
the project has **no backend yet**. PKCE public client is the correct,
standard choice for a pure SPA and is revisited when the API tier is built
(see Risks).

### 2.3 Frontend config delivery — runtime `auth-config.json`

**Problem.** The Cognito User Pool ID, app client ID, and Hosted UI domain are
not known until `AuthStack` deploys. They are environment-specific (prod vs.
each PR env). They are **not secrets** but must not be hardcoded. Vite inlines
`VITE_*` env vars at build time — but for ephemeral envs the build happens
*before* we know the env's own callback domain, and the prod pipeline builds
once for a single environment.

**Decision.** Do **not** bake Cognito config into the bundle via `VITE_*`.
Instead the deploy step writes a small `auth-config.json` to the S3 site root,
and the shell `fetch`es it at startup.

```jsonc
// served at  https://<distribution-domain>/auth-config.json
{
  "userPoolId": "us-east-1_xxxxxxxxx",
  "clientId": "xxxxxxxxxxxxxxxxxxxxxxxxxx",
  "cognitoDomain": "https://auspex40k-auth.auth.us-east-1.amazoncognito.com",
  "redirectUri": "https://d32ma5g6gjg1fb.cloudfront.net/auth/callback",
  "postLogoutRedirectUri": "https://d32ma5g6gjg1fb.cloudfront.net/",
  "scopes": ["openid", "email", "profile"]
}
```

**Why runtime fetch over build-time inlining.**
- The **same build artifact** works in any environment — the prod pipeline and
  the PR workflow build once and the per-env values are injected at deploy
  time, exactly as `SITE_BUCKET` / `DISTRIBUTION_ID` already are.
- Solves the chicken-and-egg cleanly: `AuthStack` deploys, emits CfnOutputs,
  the deploy step renders `auth-config.json` from those outputs and `aws s3 cp`s
  it alongside the static assets. No second build.
- The values are public (a SPA client ID is not a secret), so serving them as
  a static JSON file is safe.

**Mechanics.**
- `AuthStack` exposes `userPoolId`, `userPoolClientId`, `cognitoDomain` as
  `CfnOutput`s, re-exported at `AppStage` scope (same pattern as
  `siteBucketName` / `distributionId`).
- The pipeline's `BuildAndDeploy` step (and the PR workflow) gain
  `envFromCfnOutputs` entries for these, then run a step that writes
  `auth-config.json` and uploads it to `s3://$SITE_BUCKET/auth-config.json`.
- CloudFront must serve `auth-config.json` with a **short TTL** (e.g. 60 s) so a
  config change is picked up quickly — add a dedicated cache behaviour, or set
  `Cache-Control: max-age=60` on the object at upload time (`aws s3 cp
  --cache-control`). The latter is simpler and preferred.
- Local dev: a checked-in `apps/shell/public/auth-config.json` with
  `localhost` values; the deployed file overrides it in S3.

### 2.4 Google Client Secret — AWS Secrets Manager

**Decision.** Store the Google OAuth **Client ID** and **Client Secret** in a
single AWS Secrets Manager secret. `AuthStack` reads it at synth/deploy time to
configure the `UserPoolIdentityProviderGoogle` construct.

```
Secret name:  auspex40k/auth/google-oauth
Secret value: { "clientId": "...", "clientSecret": "..." }
```

**Why the secret is needed even for a PKCE SPA.** PKCE removes the secret from
the *browser*. But Cognito itself, acting as the OAuth client *to Google*, is a
confidential client and Google **requires** a client secret for the Cognito↔Google
exchange. The secret lives only in Cognito's configuration and in Secrets
Manager — never in the frontend.

**Rationale for Secrets Manager over SSM Parameter Store.**
- It is a genuine credential (rotatable, sensitive) — Secrets Manager is the
  semantically correct home and supports rotation if Google ever issues a new
  secret.
- The cost (~$0.40/secret/month) is negligible for one secret.
- SSM `SecureString` would also work; Secrets Manager is preferred for the
  rotation story and clearer intent. (Non-secret config like the Cognito domain
  prefix stays as plain CDK context / constants — not every value needs a vault.)

**CDK wiring.**
- The secret is **created once, manually** (its value cannot be set safely from
  source-controlled CDK). `AuthStack` references it with
  `secretsmanager.Secret.fromSecretNameV2(...)`.
- CDK reads the values via `secret.secretValueFromJson('clientId' | 'clientSecret')`,
  which produces CloudFormation dynamic references — the plaintext never
  appears in the synthesized template or `cdk.out`.
- Bootstrapping (one-time, documented in the runbook section below):
  ```
  aws secretsmanager create-secret \
    --name auspex40k/auth/google-oauth \
    --secret-string '{"clientId":"...","clientSecret":"..."}'
  ```

### 2.5 CDK structure — new `AuthStack` inside `AppStage`

**Decision.** Add `infrastructure/lib/auth-stack.ts` (`AuthStack`) and an
`infrastructure/lib/auth.ts` (`Auth` construct, mirroring the `Hosting`
construct split). `AppStage` instantiates both `HostingStack` and `AuthStack`.
Ephemeral PR environments instantiate `AuthStack` too.

**Rationale.**
- Auth resources have a **different lifecycle** from hosting: the User Pool and
  user data must **survive** stack updates and must **never** be destroyed by a
  PR teardown. Hosting buckets are `RemovalPolicy.DESTROY`; the User Pool must
  be `RETAIN`. Mixing them in one stack is dangerous.
- A separate stack keeps `HostingStack` unchanged and lets `AuthStack` be
  reasoned about and reviewed independently.
- It stays within the existing `AppStage`, so the self-mutating pipeline
  deploys it automatically with no pipeline-shape change — only a new stack and
  new CfnOutputs to wire.

**Shared pool, per-environment app client (the key design point).**
- The **User Pool is a single, long-lived, shared resource** across prod and
  all PR envs. It is created once and `RemovalPolicy.RETAIN`.
- Each environment's `AuthStack` creates **its own app client** on that pool,
  with callback/logout URLs scoped to that environment's CloudFront domain.
- This is the standard pattern: it avoids a Google OAuth IdP reconfiguration
  per PR (Google's authorized-redirect-URI list points only at the *single*
  Cognito domain, which never changes), while still giving every PR env
  correct, isolated redirect URIs.

**Implementation note — referencing the shared pool from PR stacks.** The PR
`AuthStack` must not re-create the pool. Two options:
1. Export the pool ID from the prod `AuthStack` and import it by a stable name
   in PR stacks (`UserPool.fromUserPoolId`).
2. Pass the known pool ID via CDK context to PR deploys.

Recommended: a stable, well-known User Pool created by a **one-time
`AuthCoreStack`** (like `GithubOidcStack` — synthesised always, deployed once,
never touched by PR events). Prod and PR `AuthStack`s both *import* that pool
and only *add app clients*. This keeps the pool's lifecycle fully decoupled
from any pipeline or PR.

> **Open question for the developer:** confirm whether the prod `AuthStack`
> owns the pool or a dedicated `AuthCoreStack` does. Recommendation above is
> `AuthCoreStack` for clean lifecycle separation; final call can be made when
> coding if a simpler layout is preferred for v1.

### 2.6 Frontend library — `oidc-client-ts` in a shared `@40kauspex/auth` package

**Decision.** Use **`oidc-client-ts`** (with `react-oidc-context` for the React
bindings). Wrap all auth concerns in a new workspace package
`packages/auth` (`@40kauspex/auth`) that exports a provider, a hook, and a
typed user/session shape.

**Rationale.**
- `oidc-client-ts` is a small, standards-pure OIDC/OAuth2 + PKCE client. It
  talks to *any* compliant `/authorize` + `/token` endpoint — Cognito today,
  trivially portable later.
- **Why not Amplify v6 (`@aws-amplify/auth`).** Amplify works, but it pulls a
  large, opinionated dependency graph and couples the frontend tightly to
  Cognito. The brief explicitly asks for multi-provider extensibility and
  future-proofing; the OIDC-standard client keeps the door open and the bundle
  small (important for an MFE shell).
- **Why not raw `fetch`.** PKCE (code verifier/challenge, state/nonce, token
  refresh, silent renew, expiry handling) is fiddly and security-sensitive.
  A vetted library is the right call.

**Cross-MFE auth state — the federation concern.**
- The **shell owns auth**. It wraps the app (including the federated
  `mfe-home`) in the `AuthProvider` from `@40kauspex/auth`.
- `@40kauspex/auth` is declared as a **Module Federation shared singleton**
  (alongside `react` / `react-dom`) in *both* the shell and `mfe-home` Vite
  configs. This guarantees one auth context instance across the federation
  boundary — `mfe-home` calls `useAuth()` and reads the shell's session
  directly. No prop drilling, no postMessage bridge.
- `mfe-home` lists `@40kauspex/auth` as a `peerDependency` and a federation
  shared module so it never bundles its own copy.

**Package surface (`@40kauspex/auth`).**
```ts
// Provider — wraps the app in the shell, fetches auth-config.json,
// configures oidc-client-ts.
export function AuthProvider(props: { children: ReactNode }): JSX.Element;

// Hook — usable in shell AND any federated MFE.
export function useAuth(): {
  isLoading: boolean;
  isAuthenticated: boolean;
  user: AuthUser | null;       // { id, email, name, picture }
  accessToken: string | null;  // for future API Gateway calls
  signIn: () => void;          // redirects to Cognito Hosted UI -> Google
  signOut: () => void;
};

// Route guard for the shell.
export function RequireAuth(props: { children: ReactNode }): JSX.Element;
```

### 2.7 Shell routing and the login gate

The shell currently has no router. Auth introduces three concerns: a login
page, a callback handler, and gating the main content. Add a minimal router
(`react-router-dom`) to the shell:

| Route | Renders | Auth |
|-------|---------|------|
| `/login` | Branded login page (shadcn card + "Sign in with Google" button) | Public; redirects to `/` if already authed |
| `/auth/callback` | Callback handler — `oidc-client-ts` completes the code exchange, then redirects to `/` | Public |
| `/` (and all else) | `<RequireAuth>` → existing shell layout → `<HomeApp/>` (mfe-home) | Protected; redirects to `/login` if not authed |

`RequireAuth` redirects unauthenticated users to `/login`. The
`/auth/callback` route must resolve before React Router renders the guard, so
the callback page is mounted outside the guard.

**CloudFront note.** The existing SPA error-response rewrite (403/404 →
`/index.html`) already makes deep links like `/auth/callback` work — no
distribution change needed for routing. The only CloudFront concern is the
`auth-config.json` cache TTL (see 2.3).

---

## 3. CDK resource list

### One-time `AuthCoreStack` (deployed manually once, like `GithubOidcStack`)
- `cognito.UserPool` — `RemovalPolicy.RETAIN`, sign-in via email, standard
  attributes `email` / `name` / `picture`, advanced security as desired.
- `cognito.UserPoolDomain` — prefix domain `auspex40k-auth`.
- `cognito.UserPoolIdentityProviderGoogle` — `clientId` / `clientSecret` read
  from the `auspex40k/auth/google-oauth` Secrets Manager secret;
  attribute mapping Google `email|name|picture` → Cognito attributes;
  scopes `openid profile email`.
- `CfnOutput`s: `UserPoolId`, `UserPoolProviderName`, `CognitoDomain`.

### Per-environment `AuthStack` (in `AppStage` for prod; in `EphemeralStack` flow for PRs)
- Imports the shared pool via `UserPool.fromUserPoolId(...)`.
- `cognito.UserPoolClient` (one per environment):
  - public client, **no secret**, PKCE enforced.
  - `oAuth.flows`: `authorizationCodeGrant: true`.
  - `oAuth.scopes`: `OPENID`, `EMAIL`, `PROFILE`.
  - `oAuth.callbackUrls`: `https://<env-cloudfront-domain>/auth/callback`
    (+ `http://localhost:3000/auth/callback` on the prod/dev client only).
  - `oAuth.logoutUrls`: `https://<env-cloudfront-domain>/`.
  - `supportedIdentityProviders`: `[GOOGLE]` (extend later).
- `CfnOutput`s: `UserPoolClientId`, plus re-exported `UserPoolId` /
  `CognitoDomain` so the deploy step can build `auth-config.json`.

### Secrets Manager (created manually, referenced by CDK)
- `auspex40k/auth/google-oauth` — `{ clientId, clientSecret }`.

### Wiring changes to existing stacks
- `AppStage` — instantiate `AuthStack`; re-export its CfnOutputs at stage scope
  (mirrors `siteBucketName` / `distributionId`).
- `EphemeralStack` — instantiate a PR-scoped `AuthStack` so each PR env gets its
  own app client with PR-domain callback URLs.
- `PipelineStack` `BuildAndDeploy` step and `pr-ephemeral-deploy.yml` — add an
  `auth-config.json` generation + upload step (see Data flow §5).

### IdP requirement outside AWS (manual, one-time)
- A **Google Cloud OAuth 2.0 Client** (type: Web application).
  - Authorized redirect URI:
    `https://auspex40k-auth.auth.us-east-1.amazoncognito.com/oauth2/idpresponse`
    — this is the **Cognito** callback, set **once**, never per-PR.
  - Its client ID/secret go into the Secrets Manager secret above.

---

## 4. Secrets and config classification

| Value | Secret? | Stored where | Reaches frontend? |
|-------|---------|--------------|-------------------|
| Google client secret | Yes | Secrets Manager `auspex40k/auth/google-oauth` | Never |
| Google client ID | Treated as secret (same secret blob) | Secrets Manager | Never (only Cognito uses it) |
| Cognito User Pool ID | No (public identifier) | CDK output → `auth-config.json` | Yes (runtime fetch) |
| Cognito app client ID | No (public SPA client, no secret) | CDK output → `auth-config.json` | Yes (runtime fetch) |
| Cognito Hosted UI domain | No | CDK constant / output → `auth-config.json` | Yes (runtime fetch) |
| Per-env callback URLs | No | Derived from CloudFront domain in CDK | Yes (in `auth-config.json`) |

Principle: only the Google **secret** is vaulted; everything else is public
identifier material delivered as static JSON.

---

## 5. Data flow

### Login (Authorization Code + PKCE)
```
Browser (shell SPA)
  |
  | 1. App boot: GET /auth-config.json  (CloudFront/S3, short TTL)
  |    -> { userPoolId, clientId, cognitoDomain, redirectUri, scopes }
  |
  | 2. User unauthenticated -> React Router renders /login
  | 3. User clicks "Sign in with Google"
  |    oidc-client-ts builds PKCE challenge, redirects browser to:
  |    GET {cognitoDomain}/oauth2/authorize
  |        ?response_type=code
  |        &client_id={clientId}
  |        &redirect_uri={redirectUri}
  |        &scope=openid+email+profile
  |        &identity_provider=Google
  |        &code_challenge=...&code_challenge_method=S256&state=...
  v
Cognito Hosted UI  --(immediate redirect, no Cognito screen)-->  Google
  |
  | 4. User consents at Google
  v
Google  --redirect-->  {cognitoDomain}/oauth2/idpresponse
  |
  | 5. Cognito exchanges Google code (uses Google secret from its config),
  |    creates/links the Cognito user, mints a Cognito authorization code
  v
Browser  <--redirect--  {redirectUri}  i.e.  /auth/callback?code=...&state=...
  |
  | 6. /auth/callback route: oidc-client-ts POSTs to
  |    {cognitoDomain}/oauth2/token  with code + PKCE code_verifier
  |    -> { id_token, access_token, refresh_token }
  | 7. Tokens stored by oidc-client-ts (in-memory + sessionStorage);
  |    AuthProvider context now isAuthenticated = true
  | 8. Redirect to / -> RequireAuth passes -> shell renders -> mfe-home loads
  v
mfe-home (federated)  calls useAuth() from the shared @40kauspex/auth singleton
                      -> reads the SAME session the shell established
```

### Deploy-time config generation (per environment)
```
CDK deploy
  AuthStack -> CfnOutputs: UserPoolId, UserPoolClientId, CognitoDomain
  HostingStack -> CfnOutputs: SiteBucketName, DistributionId, SiteUrl
        |
        v
BuildAndDeploy step / pr-ephemeral-deploy.yml
  reads outputs (envFromCfnOutputs / cdk-outputs.json)
  renders auth-config.json from them
  aws s3 cp auth-config.json s3://$SITE_BUCKET/auth-config.json \
      --cache-control "max-age=60"
  aws cloudfront create-invalidation ... /*
```

### Logout
```
signOut() -> oidc-client-ts clears local tokens, redirects to:
  GET {cognitoDomain}/logout?client_id=...&logout_uri={postLogoutRedirectUri}
  -> Cognito clears its session cookie -> redirect to / -> /login
```

---

## 6. Ephemeral PR environments

- The **User Pool and Google IdP are shared** — Google's authorized redirect
  URI list points only at the single Cognito domain, so no Google Console
  change is ever needed per PR.
- Each PR's `EphemeralStack` deploys an `AuthStack` that adds a **new app
  client** on the shared pool with callbacks scoped to that PR's CloudFront
  domain (`https://<pr-distribution>.cloudfront.net/auth/callback`).
- `pr-ephemeral-deploy.yml` already reads `SiteBucketName` / `DistributionId` /
  `SiteUrl` from `cdk-outputs.json`; it gains `UserPoolId` / `UserPoolClientId`
  / `CognitoDomain` and an `auth-config.json` generation + upload step before
  the CloudFront invalidation.
- `pr-ephemeral-teardown.yml` destroys the PR stack; because the app client is
  PR-scoped it is removed cleanly, and because the pool is in a separate
  shared stack the **pool and all users survive**.
- Cost: app clients are free; the only shared cost is the single pool's MAU.

---

## 7. Open questions / product input needed

1. **Sign-out scope.** Should `signOut()` also end the Google session, or only
   the Cognito + app session? Default proposed: app + Cognito only (most apps
   do not log the user out of Google).
2. **Account linking.** If a user later signs in with a *different* provider
   using the *same email*, should Cognito link them to one identity? Cognito
   does not auto-link by default. Decision needed when the second provider is
   added.
3. **Authorization model.** Login proves *identity*. Do we need roles/groups
   (e.g. admin vs. user)? If so, Cognito **groups** map cleanly to JWT claims —
   flag now so the pool is configured before users exist.
4. **Custom domain.** Hosted UI uses an `amazoncognito.com` prefix domain for
   v1. If a branded auth domain (e.g. `auth.40kauspex.com`) is wanted, that
   needs an ACM cert + Route 53 and should be planned alongside an app custom
   domain.
5. **PR-env pool isolation.** Plan shares one pool across prod + PR envs (test
   sign-ups land in the prod pool). Acceptable for a low-traffic app; if test
   data pollution is a concern, a dedicated non-prod pool can be added.
6. **First provider list at launch.** Confirmed scope is Google only for v1;
   the design supports more but none are configured.

## 8. Risks

- **Refresh tokens in a public SPA.** With a public client, the refresh token
  lives in the browser (`sessionStorage` via `oidc-client-ts`). This is the
  standard SPA trade-off and is acceptable for launch. **Mitigation / future
  work:** when the backend API tier is built, move the token exchange behind a
  confidential-client Lambda + HttpOnly cookie (BFF pattern). The
  `@40kauspex/auth` package boundary is designed so this swap does not touch
  feature code. Keep refresh-token validity modest (30 days) and enable token
  revocation on the app client.
- **`auth-config.json` caching.** If the short TTL / `Cache-Control` is
  misconfigured, a stale config (wrong client ID after a redeploy) breaks
  login. Mitigation: explicit `--cache-control max-age=60` on upload, covered
  by a smoke test that fetches `/auth-config.json` post-deploy.
- **Federation singleton drift.** If `@40kauspex/auth` is *not* correctly
  declared as a shared singleton in both Vite configs, the shell and mfe-home
  get separate auth contexts and `mfe-home` sees the user as logged out.
  Mitigation: shared-module config reviewed in the same PR as the package; an
  integration test asserts `mfe-home` sees the authenticated user.
- **Manual bootstrap steps.** The Google OAuth client, the Secrets Manager
  secret, and the one-time `AuthCoreStack` deploy are manual. Mitigation:
  document them in a runbook (below) and treat them as prerequisites in the
  feature ticket.

## 9. One-time bootstrap runbook (prerequisites before the feature PR deploys)

1. Create a Google Cloud project + OAuth 2.0 **Web application** client.
   Authorized redirect URI:
   `https://auspex40k-auth.auth.us-east-1.amazoncognito.com/oauth2/idpresponse`.
2. Create the Secrets Manager secret:
   ```
   aws secretsmanager create-secret \
     --name auspex40k/auth/google-oauth \
     --secret-string '{"clientId":"<google-client-id>","clientSecret":"<google-client-secret>"}'
   ```
3. Deploy `AuthCoreStack` once (`cdk deploy Auspex40kAuthCoreStack`) to create
   the shared User Pool, domain, and Google IdP.
4. Verify the prefix domain `auspex40k-auth` is available; adjust if taken.
5. Thereafter the self-mutating pipeline and PR workflow handle per-env app
   clients and `auth-config.json` automatically.
