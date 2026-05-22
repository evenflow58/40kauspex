import {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
} from '@aws-sdk/client-cognito-identity-provider'
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager'
import * as fs from 'fs'
import * as path from 'path'

export const AUTH_FILE = path.join(__dirname, '.auth/user.json')

export default async function globalSetup(): Promise<void> {
  const userPoolId = process.env.USER_POOL_ID
  const clientId = process.env.USER_POOL_CLIENT_ID

  if (!userPoolId || !clientId) {
    console.log('[e2e] USER_POOL_ID / USER_POOL_CLIENT_ID not set — skipping auth setup')
    return
  }

  const region = userPoolId.split('_')[0]

  // Fetch test-user credentials from Secrets Manager.
  // Stored as: { "email": "...", "password": "..." }
  const sm = new SecretsManagerClient({ region })
  let email: string
  let password: string
  try {
    const secret = await sm.send(
      new GetSecretValueCommand({ SecretId: 'auspex40k/e2e/test-user' }),
    )
    ;({ email, password } = JSON.parse(secret.SecretString!))
  } catch (err) {
    console.warn('[e2e] Could not fetch test credentials from Secrets Manager — skipping auth setup:', err)
    return
  }

  // Authenticate with Cognito using USER_PASSWORD_AUTH (no browser needed).
  const cognito = new CognitoIdentityProviderClient({ region })
  const auth = await cognito.send(
    new InitiateAuthCommand({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: clientId,
      AuthParameters: { USERNAME: email, PASSWORD: password },
    }),
  )

  const { IdToken, AccessToken, RefreshToken, ExpiresIn } = auth.AuthenticationResult!

  // Decode the ID token payload — these are the OIDC claims.
  const profile = JSON.parse(
    Buffer.from(IdToken!.split('.')[1], 'base64url').toString(),
  )

  // Shape the User object exactly as oidc-client-ts serialises it to storage.
  // The app's AuthProvider sets storage key: `oidc.user:<authority>:<clientId>`.
  const authority = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`
  const storageKey = `oidc.user:${authority}:${clientId}`
  const user = {
    id_token: IdToken,
    access_token: AccessToken,
    refresh_token: RefreshToken,
    token_type: 'Bearer',
    scope: 'openid email profile',
    profile,
    expires_at: Math.floor(Date.now() / 1000) + (ExpiresIn ?? 3600),
  }

  // Persist to disk. The authedPage fixture reads this and injects it into
  // sessionStorage via addInitScript before each authenticated test.
  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true })
  fs.writeFileSync(AUTH_FILE, JSON.stringify({ storageKey, user }, null, 2))
  console.log('[e2e] Cognito auth tokens saved to', AUTH_FILE)
}
