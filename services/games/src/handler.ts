import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from 'aws-lambda'
import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'
import { ddb, TABLE_NAME } from './db'
import { json, error } from './http'

/**
 * Reference-data handler for the 40K Auspex companion app.
 *
 * Exposed publicly (no JWT authorizer) — games, phases, factions and units are
 * static reference data with no per-user component. A single Lambda fans out
 * to the four read routes by inspecting `event.routeKey`:
 *
 *   GET /games                       — all games
 *   GET /games/{gameId}/phases       — ordered phases for a game
 *   GET /games/{gameId}/factions     — factions for a game
 *   GET /factions/{factionId}/units  — units for a faction
 */
export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> => {
  const routeKey = event.routeKey
  const params = event.pathParameters ?? {}

  try {
    switch (routeKey) {
      case 'GET /games':
        return await listGames()
      case 'GET /games/{gameId}/phases':
        return await listPhases(params.gameId)
      case 'GET /games/{gameId}/factions':
        return await listFactions(params.gameId)
      case 'GET /factions/{factionId}/units':
        return await listUnits(params.factionId)
      default:
        return error(404, `Unknown route: ${routeKey}`)
    }
  } catch (err) {
    console.error('games handler error', err)
    return error(500, 'Internal server error')
  }
}

/** GET /games — every game item (`SK = METADATA`). */
async function listGames(): Promise<APIGatewayProxyResultV2> {
  // The game set is tiny and bounded; a Scan filtered to METADATA items is
  // simpler than maintaining a GSI for this single low-frequency read.
  const result = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': 'GAMES' },
    })
  )
  const games = (result.Items ?? []).map((item) => ({
    gameId: item.gameId as string,
    name: item.name as string,
    available: item.available as boolean,
    description: item.description as string,
  }))
  return json(200, games)
}

/** GET /games/{gameId}/phases — phases ordered by their `order` field. */
async function listPhases(
  gameId: string | undefined
): Promise<APIGatewayProxyResultV2> {
  if (!gameId) return error(400, 'gameId is required')

  // Confirm the game exists so an unknown id returns 404 rather than [].
  const game = await ddb.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `GAME#${gameId}`, SK: 'METADATA' },
    })
  )
  if (!game.Item) return error(404, `Unknown game: ${gameId}`)

  const result = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `GAME#${gameId}`,
        ':sk': 'PHASE#',
      },
    })
  )
  const phases = (result.Items ?? [])
    .map((item) => ({
      order: item.order as number,
      name: item.name as string,
      description: item.description as string,
      keyActions: (item.keyActions as string[]) ?? [],
      relevantKeywords: (item.relevantKeywords as string[]) ?? [],
    }))
    .sort((a, b) => a.order - b.order)
  return json(200, phases)
}

/** GET /games/{gameId}/factions — factions belonging to a game. */
async function listFactions(
  gameId: string | undefined
): Promise<APIGatewayProxyResultV2> {
  if (!gameId) return error(400, 'gameId is required')

  const result = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `GAME#${gameId}`,
        ':sk': 'FACTION#',
      },
    })
  )
  const factions = (result.Items ?? []).map((item) => ({
    factionId: item.factionId as string,
    name: item.name as string,
  }))
  return json(200, factions)
}

/** GET /factions/{factionId}/units — units belonging to a faction. */
async function listUnits(
  factionId: string | undefined
): Promise<APIGatewayProxyResultV2> {
  if (!factionId) return error(400, 'factionId is required')

  const result = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `FACTION#${factionId}`,
        ':sk': 'UNIT#',
      },
    })
  )
  const units = (result.Items ?? []).map((item) => ({
    unitId: item.unitId as string,
    factionId: item.factionId as string,
    name: item.name as string,
    keywords: (item.keywords as string[]) ?? [],
    movement: item.movement as number,
    hasRanged: item.hasRanged as boolean,
    hasMelee: item.hasMelee as boolean,
    briefAbility: (item.briefAbility as string | undefined) ?? null,
    battlefieldRole: item.battlefieldRole as string,
  }))
  return json(200, units)
}
