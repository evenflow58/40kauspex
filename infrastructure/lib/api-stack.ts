import { Stack, StackProps, CfnOutput, Duration } from 'aws-cdk-lib';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as authorizers from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';
import * as path from 'path';

export interface ApiStackProps extends StackProps {
  /** Shared Cognito User Pool ID — used to build the JWT authorizer issuer. */
  readonly userPoolId: string;
  /** Cognito app client ID — the JWT authorizer audience. */
  readonly userPoolClientId: string;
  /**
   * Cognito JWT issuer URL,
   * `https://cognito-idp.<region>.amazonaws.com/<userPoolId>`.
   *
   * Passed by the caller for completeness and to keep the issuer source of
   * truth in one place; the stack itself derives the issuer from its own
   * `region` + `userPoolId` so it stays correct even if synthesised into a
   * different region than the caller assumed.
   */
  readonly cognitoDomain: string;
}

/**
 * HTTP API tier for 40K Auspex.
 *
 * Creates an API Gateway v2 HTTP API with a Cognito JWT authorizer and a
 * single public `GET /health` route backed by a Node.js Lambda. The authorizer
 * is defined but deliberately NOT attached to `/health` — `/health` is public
 * so uptime checks and the front-end can probe the API without a session. The
 * authorizer is scaffolding ready to gate the authed routes added later.
 *
 * Lives inside `AppStage` alongside `HostingStack` and `AuthStack`. The
 * `userPoolClientId` is a plain CloudFormation token threaded in from
 * `AuthStack`; CDK materialises the cross-stack reference automatically.
 */
export class ApiStack extends Stack {
  /** HTTP API invoke URL output (consumed by the deploy step). */
  public readonly apiUrlOutput: CfnOutput;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const { userPoolId, userPoolClientId } = props;

    // Node.js Lambda for the health check. `aws-lambda-nodejs` bundles the
    // TypeScript entry with esbuild at synth time — no separate build step.
    // The entry path is resolved from this file so it is independent of the
    // process working directory at synth.
    const healthFn = new nodejs.NodejsFunction(this, 'HealthFunction', {
      entry: path.join(
        __dirname,
        '..',
        '..',
        'services',
        'health',
        'src',
        'handler.ts'
      ),
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'handler',
      timeout: Duration.seconds(10),
      memorySize: 128,
      bundling: {
        minify: true,
        sourceMap: false,
      },
    });

    // HTTP API. CORS is permissive for now (public health check + future
    // browser calls); tighten `allowOrigins` once the API has real consumers.
    const httpApi = new apigwv2.HttpApi(this, 'HttpApi', {
      apiName: 'auspex40k-api',
      corsPreflight: {
        allowOrigins: ['*'],
        allowMethods: [
          apigwv2.CorsHttpMethod.GET,
          apigwv2.CorsHttpMethod.POST,
          apigwv2.CorsHttpMethod.OPTIONS,
        ],
        allowHeaders: ['Authorization', 'Content-Type'],
      },
    });

    // Cognito JWT authorizer — created for future authed routes. Not attached
    // to `/health`. The issuer is derived from the stack region + pool id.
    const jwtAuthorizer = new authorizers.HttpJwtAuthorizer(
      'JwtAuthorizer',
      `https://cognito-idp.${this.region}.amazonaws.com/${userPoolId}`,
      {
        jwtAudience: [userPoolClientId],
      }
    );
    // Referenced so a future authed route can attach it; `void` keeps the
    // unused-local check happy until that route lands.
    void jwtAuthorizer;

    // Public health route — no authorizer.
    httpApi.addRoutes({
      path: '/health',
      methods: [apigwv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration(
        'HealthIntegration',
        healthFn
      ),
    });

    this.apiUrlOutput = new CfnOutput(this, 'ApiUrl', {
      value: httpApi.apiEndpoint,
      description:
        'Base invoke URL of the 40K Auspex HTTP API (consumed by auth-config.json).',
    });
  }
}
