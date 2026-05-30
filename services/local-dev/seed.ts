import {
  CreateTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
} from '@aws-sdk/client-dynamodb'

// Must be set before the dynamic import below constructs the DynamoDB client
// inside games/src/seed.ts → games/src/db.ts.
process.env['TABLE_NAME'] ??= 'auspex40k-companion-local'
process.env['AWS_ENDPOINT_URL'] ??= 'http://localhost:8000'
process.env['AWS_ACCESS_KEY_ID'] ??= 'local'
process.env['AWS_SECRET_ACCESS_KEY'] ??= 'local'
process.env['AWS_REGION'] ??= 'us-east-1'

void (async () => {
  const TABLE_NAME = process.env['TABLE_NAME']!
  const client = new DynamoDBClient({})

  try {
    await client.send(new DescribeTableCommand({ TableName: TABLE_NAME }))
    console.log(`Table already exists: ${TABLE_NAME}`)
  } catch (err: unknown) {
    if ((err as { name?: string }).name === 'ResourceNotFoundException') {
      console.log(`Creating table: ${TABLE_NAME}`)
      await client.send(
        new CreateTableCommand({
          TableName: TABLE_NAME,
          KeySchema: [
            { AttributeName: 'PK', KeyType: 'HASH' },
            { AttributeName: 'SK', KeyType: 'RANGE' },
          ],
          AttributeDefinitions: [
            { AttributeName: 'PK', AttributeType: 'S' },
            { AttributeName: 'SK', AttributeType: 'S' },
          ],
          BillingMode: 'PAY_PER_REQUEST',
        })
      )
      console.log(`Table created: ${TABLE_NAME}`)
    } else {
      throw err
    }
  }

  const { handler: seedHandler } = await import('../games/src/seed')
  await seedHandler({ RequestType: 'Create' })
  console.log('Done')
})()
