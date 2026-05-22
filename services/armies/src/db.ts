import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'

/**
 * Shared DynamoDB Document client for the armies service.
 *
 * `DynamoDBDocumentClient` marshals/unmarshals plain JS objects so handler
 * code deals only in plain objects. Created once at module load and reused
 * across warm Lambda invocations.
 */
export const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
})

/** Name of the single companion table, injected by CDK via `TABLE_NAME`. */
export const TABLE_NAME = process.env.TABLE_NAME ?? 'auspex40k-companion'
