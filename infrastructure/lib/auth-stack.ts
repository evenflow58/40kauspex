import { Construct } from 'constructs';
import { CfnOutput, Stack, StackProps } from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { Auth } from './auth';

export interface AuthStackProps extends StackProps {
  /**
   * ID of the shared Cognito User Pool created by `AuthCoreStack`.
   * Passed in (via CDK context) because `AuthCoreStack` is a separately
   * deployed one-time stack.
   */
  readonly userPoolId: string;
  /**
   * CloudFront distribution domain for this environment (no scheme), e.g.
   * `d32ma5g6gjg1fb.cloudfront.net`. Used to build the OAuth callback and
   * logout URLs at synth time.
   */
  readonly distributionDomain: string;
}

/**
 * Production per-environment auth stack. A thin `Stack` wrapper around the
 * shared `Auth` construct (which adds a Cognito app client to the shared
 * pool) plus the CfnOutputs the deploy step reads to build `auth-config.json`.
 *
 * Lives inside `AppStage` alongside `HostingStack`. The pool itself is owned
 * by the one-time `AuthCoreStack` and is only imported here.
 */
export class AuthStack extends Stack {
  /** Output carrying the app client id (consumed by the deploy step). */
  public readonly userPoolClientIdOutput: CfnOutput;
  /** Output carrying the shared User Pool id (consumed by the deploy step). */
  public readonly userPoolIdOutput: CfnOutput;
  /**
   * The per-environment Cognito app client. Re-exported from the nested
   * `Auth` construct so a sibling stack (e.g. `ApiStack`) can use its
   * `userPoolClientId` token as the JWT authorizer audience.
   */
  public readonly userPoolClient: cognito.IUserPoolClient;

  constructor(scope: Construct, id: string, props: AuthStackProps) {
    super(scope, id, props);

    const { userPoolId, distributionDomain } = props;

    const auth = new Auth(this, 'Auth', { userPoolId, distributionDomain });
    this.userPoolClient = auth.userPoolClient;

    // Outputs are defined at STACK scope so their template keys are exactly
    // `UserPoolClientId` / `UserPoolId` for `envFromCfnOutputs` / `jq`.
    this.userPoolClientIdOutput = new CfnOutput(this, 'UserPoolClientId', {
      value: auth.userPoolClient.userPoolClientId,
      description:
        'Cognito app client ID for this environment (consumed by auth-config.json).',
    });
    this.userPoolIdOutput = new CfnOutput(this, 'UserPoolId', {
      value: userPoolId,
      description: 'Shared Cognito User Pool ID (consumed by auth-config.json).',
    });
  }
}
