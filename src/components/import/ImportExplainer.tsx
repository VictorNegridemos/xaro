// The always-visible explanation of the Import page (plan 6.8, wording fixed by the plan).
import { Panel } from '@/components/ui/Panel'
import styles from './import.module.scss'

export const PROCESS_COMMAND = 'npm run import -- --pending'

export function ImportExplainer(): React.JSX.Element {
  return (
    <Panel title="How import works" tone="accent" className={styles.explainer}>
      <p data-import-explainer="">
        Uploading only stores the file in the queue. Nothing is processed on this website. To process the queue,
        run <code className={styles.command}>{PROCESS_COMMAND}</code> on the ship&apos;s maintenance terminal (the
        owner&apos;s PC, with the Claude CLI installed and logged in). Entries appear here and in search after that
        command has finished.
      </p>
    </Panel>
  )
}
