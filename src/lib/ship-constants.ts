// Hard-coded ship readouts that have no table behind them (M12). FROZEN in Step 2.

/** Kodning reserve shown in the ship bar. */
export const KODNING_RESERVE = '2.5%'

export interface LocationRow {
  label: string
  value: string
  /** The one row the old panel highlighted. */
  emphasis?: boolean
}

/** "Current location" readout, in display order. */
export const LOCATION_READOUT: readonly LocationRow[] = [
  { label: 'Dimension', value: 'UNKNOWN' },
  { label: 'Observable universe', value: 'UNKNOWN' },
  { label: 'Galaxy', value: 'Damortia' },
  { label: 'System', value: 'N/A' },
  { label: 'Planet', value: 'N/A' },
  { label: 'Temperature', value: 'N/A' },
  { label: 'Ground composition', value: 'N/A' },
  { label: 'Atmospheric composition', value: 'N/A' },
  { label: 'Life signs', value: 'NONE' },
  { label: 'Urbanization', value: 'NONE' },
  { label: 'Valuable resources', value: 'NONE', emphasis: true },
]
