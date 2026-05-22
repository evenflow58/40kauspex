import { Stack, StackProps, RemovalPolicy, CfnOutput } from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export interface DataStackProps extends StackProps {
  /**
   * Name for the companion DynamoDB table. The production stage uses the
   * fixed `auspex40k-companion`; ephemeral PR environments pass a suffixed
   * name so each preview gets an isolated table.
   */
  readonly tableName: string;
}

/**
 * Data tier for the 40K Auspex tabletop companion feature.
 *
 * Owns a single DynamoDB table (`single-table design`) holding every entity
 * for the companion: games, phases, factions, units, user armies and the
 * units on those armies. The access patterns are all `Query` by partition
 * key with an optional `begins_with` on the sort key, so no GSI is needed.
 *
 *   Game      PK=GAME#<id>      SK=METADATA
 *   Game list PK=GAMES          SK=GAME#<id>
 *   Phase     PK=GAME#<id>      SK=PHASE#<order>
 *   Faction   PK=GAME#<id>      SK=FACTION#<id>
 *   Unit      PK=FACTION#<id>   SK=UNIT#<id>
 *   UserArmy  PK=USER#<sub>     SK=ARMY#<armyId>
 *   ArmyUnit  PK=ARMY#<armyId>  SK=UNIT#<unitId>#<entryId>
 *
 * `PAY_PER_REQUEST` billing suits the spiky, low-volume access of a companion
 * app with no capacity planning. `RemovalPolicy.DESTROY` is appropriate for
 * iteration 1 — the table is fully repopulated from the seed custom resource
 * on every deploy, so there is no irreplaceable state to retain.
 */
export class DataStack extends Stack {
  /** The companion single table. Consumed by `ApiStack`. */
  public readonly table: dynamodb.Table;

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);

    this.table = new dynamodb.Table(this, 'CompanionTable', {
      tableName: props.tableName,
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    new CfnOutput(this, 'CompanionTableName', {
      value: this.table.tableName,
      description: 'Name of the 40K Auspex companion DynamoDB table.',
    });
  }
}
