import { BatchWriteCommand } from '@aws-sdk/lib-dynamodb'
import { ddb, TABLE_NAME } from './db'
import seedData from './seed-data.json'

/**
 * Minimal CloudFormation custom-resource event shape. The CDK `Provider`
 * framework invokes this Lambda with a `RequestType` of Create / Update /
 * Delete; only the request type is needed here.
 */
interface CustomResourceEvent {
  RequestType: 'Create' | 'Update' | 'Delete'
  PhysicalResourceId?: string
}

interface CustomResourceResponse {
  PhysicalResourceId: string
}

type Item = Record<string, unknown>

/**
 * Build every DynamoDB item for the companion reference data from the bundled
 * `seed-data.json`. Two representations of each game are written:
 *
 *  - `PK=GAMES,        SK=GAME#<id>`   — so `GET /games` is a single Query.
 *  - `PK=GAME#<id>,    SK=METADATA`    — so per-game existence checks are a Get.
 */
function buildItems(): Item[] {
  const items: Item[] = []

  for (const game of seedData.games) {
    const gameAttrs = {
      gameId: game.gameId,
      name: game.name,
      available: game.available,
      description: game.description,
    }
    items.push({ PK: 'GAMES', SK: `GAME#${game.gameId}`, ...gameAttrs })
    items.push({ PK: `GAME#${game.gameId}`, SK: 'METADATA', ...gameAttrs })
  }

  for (const [gameId, phases] of Object.entries(seedData.phases)) {
    for (const phase of phases) {
      items.push({
        PK: `GAME#${gameId}`,
        // Zero-padded so the lexical Query sort matches the numeric order.
        SK: `PHASE#${String(phase.order).padStart(3, '0')}`,
        order: phase.order,
        name: phase.name,
        description: phase.description,
        keyActions: phase.keyActions,
        relevantKeywords: phase.relevantKeywords,
      })
    }
  }

  for (const [gameId, factions] of Object.entries(seedData.factions)) {
    for (const faction of factions) {
      items.push({
        PK: `GAME#${gameId}`,
        SK: `FACTION#${faction.factionId}`,
        factionId: faction.factionId,
        name: faction.name,
      })
    }
  }

  for (const [factionId, units] of Object.entries(seedData.units)) {
    for (const unit of units) {
      items.push({
        PK: `FACTION#${factionId}`,
        SK: `UNIT#${unit.unitId}`,
        unitId: unit.unitId,
        factionId,
        name: unit.name,
        keywords: unit.keywords,
        movement: unit.movement,
        hasRanged: unit.hasRanged,
        hasMelee: unit.hasMelee,
        briefAbility: unit.briefAbility,
        battlefieldRole: unit.battlefieldRole,
        relevantPhases: unit.relevantPhases,
      })
    }
  }

  return items
}

/** Write items to DynamoDB in chunks of 25 (the BatchWriteItem limit). */
async function batchWrite(items: Item[]): Promise<void> {
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

/**
 * Custom-resource handler that seeds the companion table with reference data.
 *
 * Runs on Create and Update (the resource's physical id embeds a hash of the
 * seed data, so editing `seed-data.json` re-triggers an Update). Delete is a
 * no-op — the table itself is removed with the stack, and leaving reference
 * data in place during a rollback is harmless.
 */
export const handler = async (
  event: CustomResourceEvent
): Promise<CustomResourceResponse> => {
  const physicalResourceId = event.PhysicalResourceId ?? 'companion-seed'

  if (event.RequestType === 'Delete') {
    return { PhysicalResourceId: physicalResourceId }
  }

  const items = buildItems()
  await batchWrite(items)
  console.log(`Seeded ${items.length} companion reference items`)

  return { PhysicalResourceId: physicalResourceId }
}
