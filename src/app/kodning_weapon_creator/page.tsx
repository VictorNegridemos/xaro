import type { Metadata } from 'next'

import { WeaponCreator } from '@/components/weapon/WeaponCreator'

export const metadata: Metadata = {
  title: 'Kodning Weapon Creator',
}

// Content only: the shell comes from the root layout.
export default function KodningWeaponCreatorPage() {
  return <WeaponCreator />
}
