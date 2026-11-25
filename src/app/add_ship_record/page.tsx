// Legacy URL (plan 2.2): the old "add record" form lives at /entry/new now.
import { permanentRedirect } from 'next/navigation'

export default function LegacyAddRecordPage(): never {
  permanentRedirect('/entry/new')
}
