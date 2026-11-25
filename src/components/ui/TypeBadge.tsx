// Fixed label and tone per entity type (plan 7.5).
import type React from 'react'
import type { EntityType } from '@/lib/data/types'
import { Badge, type BadgeTone } from './Badge'

/** Fixed label and tone per entity type. */
export const ENTITY_TYPE_LABELS: Readonly<Record<EntityType, string>> = {
  character: 'Character',
  location: 'Location',
  technology: 'Technology',
  faction: 'Faction',
  item: 'Item',
  creature: 'Creature',
  event: 'Event',
  ship_system: 'Ship system',
  record: 'Record',
  other: 'Other',
}

const TONES: Readonly<Record<EntityType, BadgeTone>> = {
  character: 'ok',
  location: 'info',
  technology: 'info',
  faction: 'warn',
  item: 'neutral',
  creature: 'danger',
  event: 'warn',
  ship_system: 'ok',
  record: 'neutral',
  other: 'neutral',
}

export interface TypeBadgeProps {
  type: EntityType
  className?: string
}

export function TypeBadge({ type, className }: TypeBadgeProps): React.JSX.Element {
  return <Badge tone={TONES[type]} className={className}>{ENTITY_TYPE_LABELS[type]}</Badge>
}
