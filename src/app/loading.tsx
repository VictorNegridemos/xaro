import { StateBlock } from '@/components/ui/StateBlock'

// Shown inside the shell while a route loads.
export default function Loading() {
  return <StateBlock kind="loading" title="QUERYING ARCHIVE…" />
}
