import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from 'aws-lambda'
import { randomUUID } from 'node:crypto'
import {
  BatchWriteCommand,
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb'
import { ddb, TABLE_NAME } from './db'
import { json, error, noContent, getUserSub, parseBody } from '@40kauspex/lambda-utils'

/** A unit as supplied by the client when creating or updating an army. */
interface UnitInput {
  unitId: string
  unitName: string
  keywords?: string[]
  movement?: number
  hasRanged?: boolean
  hasMelee?: boolean
  briefAbility?: string | null
  battlefieldRole?: string
  relevantPhases?: string[]
}

/**
 * Army CRUD handler for the 40K Auspex companion app.
 *
 * Every route is behind the API Gateway JWT authorizer. The caller's identity
 * is the Cognito `sub` claim — handlers ONLY ever read/write items under
 * `USER#<sub>` and the `ARMY#<armyId>` partitions they have verified belong to
 * that user. An `armyId` path parameter is never trusted without first
 * confirming ownership via a Get on `USER#<sub> / ARMY#<armyId>`.
 *
 *   GET    /armies            — list the caller's armies
 *   POST   /armies            — create an army
 *   GET    /armies/{armyId}   — get one army with its units
 *   PUT    /armies/{armyId}   — rename and/or replace the army's units
 *   DELETE /armies/{armyId}   — delete the army and its units
 */
export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> => {
  const sub = getUserSub(event)
  if (!sub) return error(401, 'Unauthorized')

  const routeKey = event.routeKey
  const armyId = event.pathParameters?.armyId

  try {
    switch (routeKey) {
      case 'GET /armies':
        return await listArmies(sub)
      case 'POST /armies':
        return await createArmy(sub, event.body)
      case 'GET /armies/{armyId}':
        return await getArmy(sub, armyId)
      case 'PUT /armies/{armyId}':
        return await updateArmy(sub, armyId, event.body)
      case 'DELETE /armies/{armyId}':
        return await deleteArmy(sub, armyId)
      default:
        return error(404, `Unknown route: ${routeKey}`)
    }
  } catch (err) {
    console.error('armies handler error', err)
    return error(500, 'Internal server error')
  }
}


/** Map a metadata DynamoDB item to the army summary returned by the API. */
function toArmySummary(item: Record<string, unknown>) {
  return {
    armyId: item.armyId as string,
    name: item.name as string,
    gameId: item.gameId as string,
    factionId: item.factionId as string,
    factionName: item.factionName as string,
    createdAt: item.createdAt as string,
    updatedAt: item.updatedAt as string,
  }
}

/** Map an ArmyUnit DynamoDB item to the unit shape returned by the API. */
function toArmyUnit(item: Record<string, unknown>) {
  return {
    entryId: item.entryId as string,
    unitId: item.unitId as string,
    unitName: item.unitName as string,
    keywords: (item.keywords as string[]) ?? [],
    movement: (item.movement as number) ?? 0,
    hasRanged: (item.hasRanged as boolean) ?? false,
    hasMelee: (item.hasMelee as boolean) ?? false,
    briefAbility: (item.briefAbility as string | undefined) ?? null,
    battlefieldRole: (item.battlefieldRole as string) ?? 'Other',
    relevantPhases: (item.relevantPhases as string[]) ?? [],
  }
}

/** Build an ArmyUnit DynamoDB item from a client-supplied unit. */
function buildUnitItem(armyId: string, unit: UnitInput) {
  const entryId = randomUUID()
  return {
    PK: `ARMY#${armyId}`,
    SK: `UNIT#${unit.unitId}#${entryId}`,
    entryId,
    unitId: unit.unitId,
    unitName: unit.unitName,
    keywords: unit.keywords ?? [],
    movement: unit.movement ?? 0,
    hasRanged: unit.hasRanged ?? false,
    hasMelee: unit.hasMelee ?? false,
    briefAbility: unit.briefAbility ?? undefined,
    battlefieldRole: unit.battlefieldRole ?? 'Other',
    relevantPhases: unit.relevantPhases ?? [],
  }
}

/**
 * Fetch the army metadata item only if it belongs to `sub`. Because metadata
 * lives at `USER#<sub> / ARMY#<armyId>`, a hit IS the ownership proof.
 */
async function getOwnedArmy(
  sub: string,
  armyId: string
): Promise<Record<string, unknown> | null> {
  const result = await ddb.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `USER#${sub}`, SK: `ARMY#${armyId}` },
    })
  )
  return result.Item ?? null
}

/** Query every ArmyUnit item for an army. */
async function getArmyUnits(
  armyId: string
): Promise<Record<string, unknown>[]> {
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
  return result.Items ?? []
}

/** Delete all ArmyUnit items for an army (in BatchWriteItem-sized chunks). */
async function deleteArmyUnits(armyId: string): Promise<void> {
  const units = await getArmyUnits(armyId)
  for (let i = 0; i < units.length; i += 25) {
    const chunk = units.slice(i, i + 25)
    await ddb.send(
      new BatchWriteCommand({
        RequestItems: {
          [TABLE_NAME]: chunk.map((u) => ({
            DeleteRequest: { Key: { PK: u.PK, SK: u.SK } },
          })),
        },
      })
    )
  }
}

/** Write a set of ArmyUnit items (in BatchWriteItem-sized chunks). */
async function writeArmyUnits(
  items: Record<string, unknown>[]
): Promise<void> {
  for (let i = 0; i < items.length; i += 25) {
    const chunk = items.slice(i, i + 25)
    await ddb.send(
      new BatchWriteCommand({
        RequestItems: {
          [TABLE_NAME]: chunk.map((item) => ({ PutRequest: { Item: item } })),
        },
      })
    )
  }
}

/** GET /armies — every army owned by the caller. */
async function listArmies(sub: string): Promise<APIGatewayProxyResultV2> {
  const result = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
      ExpressionAttributeValues: {
        ':pk': `USER#${sub}`,
        ':sk': 'ARMY#',
      },
    })
  )
  return json(200, (result.Items ?? []).map(toArmySummary))
}

/** POST /armies — create a new army for the caller. */
async function createArmy(
  sub: string,
  body: string | undefined
): Promise<APIGatewayProxyResultV2> {
  const parsed = parseBody(body)
  if (!parsed) return error(400, 'Request body must be valid JSON')

  const name = parsed.name
  const gameId = parsed.gameId
  const factionId = parsed.factionId
  const factionName = parsed.factionName
  if (
    typeof name !== 'string' ||
    name.trim().length === 0 ||
    typeof gameId !== 'string' ||
    typeof factionId !== 'string' ||
    typeof factionName !== 'string'
  ) {
    return error(
      400,
      'name, gameId, factionId and factionName are required'
    )
  }

  const armyId = randomUUID()
  const now = new Date().toISOString()
  const metadata = {
    PK: `USER#${sub}`,
    SK: `ARMY#${armyId}`,
    armyId,
    userId: sub,
    name: name.trim(),
    gameId,
    factionId,
    factionName,
    createdAt: now,
    updatedAt: now,
  }
  await ddb.send(new PutCommand({ TableName: TABLE_NAME, Item: metadata }))

  const unitsInput = Array.isArray(parsed.units)
    ? (parsed.units as UnitInput[])
    : []
  const unitItems = unitsInput
    .filter((u) => u && typeof u.unitId === 'string')
    .map((u) => buildUnitItem(armyId, u))
  if (unitItems.length > 0) await writeArmyUnits(unitItems)

  return json(201, {
    ...toArmySummary(metadata),
    units: unitItems.map(toArmyUnit),
  })
}

/** GET /armies/{armyId} — one army with its units, owner-scoped. */
async function getArmy(
  sub: string,
  armyId: string | undefined
): Promise<APIGatewayProxyResultV2> {
  if (!armyId) return error(400, 'armyId is required')

  const metadata = await getOwnedArmy(sub, armyId)
  if (!metadata) return error(404, `Army not found: ${armyId}`)

  const units = await getArmyUnits(armyId)
  return json(200, {
    ...toArmySummary(metadata),
    units: units.map(toArmyUnit),
  })
}

/** PUT /armies/{armyId} — rename and/or replace the army's unit set. */
async function updateArmy(
  sub: string,
  armyId: string | undefined,
  body: string | undefined
): Promise<APIGatewayProxyResultV2> {
  if (!armyId) return error(400, 'armyId is required')

  const metadata = await getOwnedArmy(sub, armyId)
  if (!metadata) return error(404, `Army not found: ${armyId}`)

  const parsed = parseBody(body)
  if (!parsed) return error(400, 'Request body must be valid JSON')

  // Apply a rename if provided; otherwise keep the existing name.
  let name = metadata.name as string
  if (parsed.name !== undefined) {
    if (typeof parsed.name !== 'string' || parsed.name.trim().length === 0) {
      return error(400, 'name must be a non-empty string')
    }
    name = parsed.name.trim()
  }

  const updated = {
    ...metadata,
    name,
    updatedAt: new Date().toISOString(),
  }
  await ddb.send(new PutCommand({ TableName: TABLE_NAME, Item: updated }))

  // `units` replaces the whole unit set when present; omit it to leave units
  // untouched (supports a rename-only PUT).
  let unitItems: Record<string, unknown>[]
  if (parsed.units !== undefined) {
    if (!Array.isArray(parsed.units)) {
      return error(400, 'units must be an array')
    }
    await deleteArmyUnits(armyId)
    unitItems = (parsed.units as UnitInput[])
      .filter((u) => u && typeof u.unitId === 'string')
      .map((u) => buildUnitItem(armyId, u))
    if (unitItems.length > 0) await writeArmyUnits(unitItems)
  } else {
    unitItems = await getArmyUnits(armyId)
  }

  return json(200, {
    ...toArmySummary(updated),
    units: unitItems.map(toArmyUnit),
  })
}

/** DELETE /armies/{armyId} — remove the army metadata and all its units. */
async function deleteArmy(
  sub: string,
  armyId: string | undefined
): Promise<APIGatewayProxyResultV2> {
  if (!armyId) return error(400, 'armyId is required')

  const metadata = await getOwnedArmy(sub, armyId)
  if (!metadata) return error(404, `Army not found: ${armyId}`)

  await deleteArmyUnits(armyId)
  await ddb.send(
    new DeleteCommand({
      TableName: TABLE_NAME,
      Key: { PK: `USER#${sub}`, SK: `ARMY#${armyId}` },
    })
  )
  return noContent()
}
