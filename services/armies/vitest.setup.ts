/**
 * Test setup for the armies service. Provides a deterministic TABLE_NAME so the
 * handler's DynamoDB calls have a stable target under test.
 */
process.env.TABLE_NAME = 'auspex40k-companion-test'

export {}
