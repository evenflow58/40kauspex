import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'

/**
 * Shared DynamoDB Document client for the games service.
 *
 * `DynamoDBDocumentClient` marshals/unmarshals plain JS objects to/from the
 * native DynamoDB attribute format so handler code deals only in plain
 * objects. The client is created once at module load and reused across warm
 * Lambda invocations.
 */
export const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
})

/**
 * Name of the single companion table. Set by CDK via the `TABLE_NAME` Lambda
 * environment variable; the fallback keeps unit tests working when the env is
 * provided by `vitest.setup.ts`.
 */
export const TABLE_NAME = process.env.TABLE_NAME ?? 'auspex40k-companion'
