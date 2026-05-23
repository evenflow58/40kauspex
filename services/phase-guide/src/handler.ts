import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from 'aws-lambda'
import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb'
import { ddb, TABLE_NAME } from './db'
import { json, error, getUserSub } from '@40kauspex/lambda-utils'

/** A unit snapshot as stored on an army (the denormalised ArmyUnit item). */
interface ArmyUnit {
  entryId: string
  unitName: string
  keywords: string[]
  briefAbility: string | null
}

/** A phase reference item. */
interface Phase {
  order: number
  name: string
  description: string
  keyActions: string[]
  relevantKeywords: string[]
}

/**
 * Phase-guidance handler for the 40K Auspex companion app.
 *
 * Behind the JWT authorizer. For a given army owned by the caller it returns,
 * per game phase, which of the army's units have keywords relevant to that
 * phase — the core "what should I be thinking about right now" feature.
 *
 *   GET /phase-guide/{armyId}
 */
export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> => {
  const sub = getUserSub(event)
  if (!sub) return error(401, 'Unauthorized')

  const armyId = event.pathParameters?.armyId
  if (!armyId) return error(400, 'armyId is required')

  try {
    // Ownership: the army metadata lives at USER#<sub> / ARMY#<armyId>, so a
    // hit both proves ownership and yields the army's gameId.
    const armyResult = await ddb.send(
      new GetCommand({
        TableName: TABLE_NAME,
        Key: { PK: `USER#${sub}`, SK: `ARMY#${armyId}` },
      })
    )
    const army = armyResult.Item
    if (!army) return error(404, `Army not found: ${armyId}`)

    const gameId = army.gameId as string

    const [units, phases] = await Promise.all([
      getArmyUnits(armyId),
      getPhases(gameId),
    ])

    const phasesWithGuidance = phases.map((phase) => {
      const phaseKeywords = new Set(
        phase.relevantKeywords.map((k) => k.toUpperCase())
      )
      const matchedUnits = units
        .map((unit) => {
          const matchedKeywords = unit.keywords.filter((k) =>
            phaseKeywords.has(k.toUpperCase())
          )
          return { unit, matchedKeywords }
        })
        // A unit appears in a phase only when it has at least one relevant
        // keyword for that phase.
        .filter(({ matchedKeywords }) => matchedKeywords.length > 0)
        .map(({ unit, matchedKeywords }) => ({
          entryId: unit.entryId,
          unitName: unit.unitName,
          matchedKeywords,
          briefAbility: unit.briefAbility,
        }))

      return {
        order: phase.order,
        name: phase.name,
        description: phase.description,
        keyActions: phase.keyActions,
        relevantKeywords: phase.relevantKeywords,
        units: matchedUnits,
      }
    })

    return json(200, {
      armyId,
      armyName: army.name as string,
      gameId,
      factionName: army.factionName as string,
      phases: phasesWithGuidance,
    })
  } catch (err) {
    console.error('phase-guide handler error', err)
    return error(500, 'Internal server error')
  }
}

/** Query the denormalised unit snapshots for an army. */
async function getArmyUnits(armyId: string): Promise<ArmyUnit[]> {
  const result = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `ARMY#${armyId}`,
        ':sk': 'UNIT#',
      },
    })
  )
  return (result.Items ?? []).map((item) => ({
    entryId: item.entryId as string,
    unitName: item.unitName as string,
    keywords: (item.keywords as string[]) ?? [],
    briefAbility: (item.briefAbility as string | undefined) ?? null,
  }))
}

/** Query the ordered phases for a game. */
async function getPhases(gameId: string): Promise<Phase[]> {
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
  return (result.Items ?? [])
    .map((item) => ({
      order: item.order as number,
      name: item.name as string,
      description: item.description as string,
      keyActions: (item.keyActions as string[]) ?? [],
      relevantKeywords: (item.relevantKeywords as string[]) ?? [],
    }))
    .sort((a, b) => a.order - b.order)
}
