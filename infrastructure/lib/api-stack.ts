import { Stack, StackProps, CfnOutput, Duration } from 'aws-cdk-lib';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as authorizers from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as customResources from 'aws-cdk-lib/custom-resources';
import * as logs from 'aws-cdk-lib/aws-logs';
import { CustomResource } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';

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
  /**
   * The companion DynamoDB table created by `DataStack`. The companion
   * Lambdas read reference data and read/write user armies here.
   */
  readonly companionTable: dynamodb.ITable;
}

/** Absolute path to a service handler entry, resolved from this file. */
function serviceEntry(service: string, file: string): string {
  return path.join(__dirname, '..', '..', 'services', service, 'src', file);
}

/**
 * HTTP API tier for 40K Auspex.
 *
 * Creates an API Gateway v2 HTTP API with a Cognito JWT authorizer. Routes:
 *
 *   Public (no authorizer):
 *     GET /health
 *     GET /games, /games/{gameId}/phases, /games/{gameId}/factions
 *     GET /factions/{factionId}/units
 *   Authed (JWT authorizer — companion army + phase-guide routes):
 *     GET/POST /armies, GET/PUT/DELETE /armies/{armyId}
 *     GET /phase-guide/{armyId}
 *
 * Backed by Node.js Lambdas bundled at synth time by `aws-lambda-nodejs`.
 * Also provisions a one-shot custom resource that seeds the companion table
 * with the game/phase/faction/unit reference data.
 *
 * Lives inside `AppStage` alongside `HostingStack`, `AuthStack` and
 * `DataStack`. The `userPoolClientId` is a plain CloudFormation token threaded
 * in from `AuthStack`; CDK materialises the cross-stack reference automatically.
 */
export class ApiStack extends Stack {
  /** HTTP API invoke URL output (consumed by the deploy step). */
  public readonly apiUrlOutput: CfnOutput;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);

    const { userPoolId, userPoolClientId, companionTable } = props;

    // ---- Lambda functions --------------------------------------------------
    // `aws-lambda-nodejs` bundles each TypeScript entry with esbuild at synth
    // time — no separate build step. Entry paths are resolved from this file
    // so they are independent of the process working directory at synth.

    const healthFn = new nodejs.NodejsFunction(this, 'HealthFunction', {
      entry: serviceEntry('health', 'handler.ts'),
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'handler',
      timeout: Duration.seconds(10),
      memorySize: 128,
      bundling: { minify: true, sourceMap: false },
    });

    // Reference-data Lambda — reads games / phases / factions / units.
    const gamesFn = new nodejs.NodejsFunction(this, 'GamesFunction', {
      entry: serviceEntry('games', 'handler.ts'),
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'handler',
      timeout: Duration.seconds(10),
      memorySize: 256,
      environment: { TABLE_NAME: companionTable.tableName },
      bundling: { minify: true, sourceMap: false },
    });
    companionTable.grantReadData(gamesFn);

    // Army CRUD Lambda — reads and writes the caller's armies.
    const armiesFn = new nodejs.NodejsFunction(this, 'ArmiesFunction', {
      entry: serviceEntry('armies', 'handler.ts'),
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'handler',
      timeout: Duration.seconds(10),
      memorySize: 256,
      environment: { TABLE_NAME: companionTable.tableName },
      bundling: { minify: true, sourceMap: false },
    });
    companionTable.grantReadWriteData(armiesFn);

    // Phase-guidance Lambda — reads an army + the game's phases.
    const phaseGuideFn = new nodejs.NodejsFunction(this, 'PhaseGuideFunction', {
      entry: serviceEntry('phase-guide', 'handler.ts'),
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'handler',
      timeout: Duration.seconds(10),
      memorySize: 256,
      environment: { TABLE_NAME: companionTable.tableName },
      bundling: { minify: true, sourceMap: false },
    });
    companionTable.grantReadData(phaseGuideFn);

    // ---- HTTP API ----------------------------------------------------------
    // CORS is permissive for now; tighten `allowOrigins` once the API has a
    // fixed front-end origin.
    const httpApi = new apigwv2.HttpApi(this, 'HttpApi', {
      apiName: 'auspex40k-api',
      corsPreflight: {
        allowOrigins: ['*'],
        allowMethods: [
          apigwv2.CorsHttpMethod.GET,
          apigwv2.CorsHttpMethod.POST,
          apigwv2.CorsHttpMethod.PUT,
          apigwv2.CorsHttpMethod.DELETE,
          apigwv2.CorsHttpMethod.OPTIONS,
        ],
        allowHeaders: ['Authorization', 'Content-Type'],
      },
    });

    // Cognito JWT authorizer — gates the companion's authed routes. The issuer
    // is derived from the stack region + pool id.
    const jwtAuthorizer = new authorizers.HttpJwtAuthorizer(
      'JwtAuthorizer',
      `https://cognito-idp.${this.region}.amazonaws.com/${userPoolId}`,
      {
        jwtAudience: [userPoolClientId],
      }
    );

    // ---- Public routes -----------------------------------------------------
    httpApi.addRoutes({
      path: '/health',
      methods: [apigwv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration(
        'HealthIntegration',
        healthFn
      ),
    });

    const gamesIntegration = new integrations.HttpLambdaIntegration(
      'GamesIntegration',
      gamesFn
    );
    for (const route of [
      '/games',
      '/games/{gameId}/phases',
      '/games/{gameId}/factions',
      '/factions/{factionId}/units',
    ]) {
      httpApi.addRoutes({
        path: route,
        methods: [apigwv2.HttpMethod.GET],
        integration: gamesIntegration,
      });
    }

    // ---- Authed routes (JWT authorizer) ------------------------------------
    const armiesIntegration = new integrations.HttpLambdaIntegration(
      'ArmiesIntegration',
      armiesFn
    );
    httpApi.addRoutes({
      path: '/armies',
      methods: [apigwv2.HttpMethod.GET, apigwv2.HttpMethod.POST],
      integration: armiesIntegration,
      authorizer: jwtAuthorizer,
    });
    httpApi.addRoutes({
      path: '/armies/{armyId}',
      methods: [
        apigwv2.HttpMethod.GET,
        apigwv2.HttpMethod.PUT,
        apigwv2.HttpMethod.DELETE,
      ],
      integration: armiesIntegration,
      authorizer: jwtAuthorizer,
    });
    httpApi.addRoutes({
      path: '/phase-guide/{armyId}',
      methods: [apigwv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration(
        'PhaseGuideIntegration',
        phaseGuideFn
      ),
      authorizer: jwtAuthorizer,
    });

    // ---- Reference-data seed custom resource -------------------------------
    // A one-shot Lambda-backed custom resource that BatchWrites the companion
    // reference data into the table. The custom resource's properties include
    // a hash of `seed-data.json`, so editing the seed data changes the hash
    // and CloudFormation re-runs the seed on the next deploy.
    const seedFn = new nodejs.NodejsFunction(this, 'CompanionSeedFunction', {
      entry: serviceEntry('games', 'seed.ts'),
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'handler',
      timeout: Duration.minutes(2),
      memorySize: 256,
      environment: { TABLE_NAME: companionTable.tableName },
      bundling: { minify: true, sourceMap: false },
    });
    companionTable.grantWriteData(seedFn);

    const seedDataPath = serviceEntry('games', 'seed-data.json');
    const seedHash = crypto
      .createHash('sha256')
      .update(fs.readFileSync(seedDataPath))
      .digest('hex');

    const seedProvider = new customResources.Provider(
      this,
      'CompanionSeedProvider',
      {
        onEventHandler: seedFn,
        logRetention: logs.RetentionDays.ONE_WEEK,
      }
    );

    new CustomResource(this, 'CompanionSeed', {
      serviceToken: seedProvider.serviceToken,
      // `seedHash` is read on every Create/Update so a seed-data change
      // triggers a re-seed; without it CloudFormation would treat the
      // resource as unchanged.
      properties: { seedHash },
    });

    this.apiUrlOutput = new CfnOutput(this, 'ApiUrl', {
      value: httpApi.apiEndpoint,
      description:
        'Base invoke URL of the 40K Auspex HTTP API (consumed by auth-config.json).',
    });
  }
}
