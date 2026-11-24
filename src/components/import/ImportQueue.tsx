// The latest import sources with their status (plan 6.8). Server-renderable: the only interactive parts
// are the Refresh and Remove client components.
import { Badge } from '@/components/ui/Badge'
import { Panel } from '@/components/ui/Panel'
import { StateBlock } from '@/components/ui/StateBlock'
import type { ImportSourceSummary } from '@/lib/data/types'
import { STATUS_LABEL, STATUS_TONE, formatBytes, formatResult, formatTime } from './format'
import { QueueRefresh } from './QueueRefresh'
import { RemoveSourceButton } from './RemoveSourceButton'
import styles from './import.module.scss'

export const EMPTY_QUEUE_TITLE = 'QUEUE EMPTY — no transmissions awaiting analysis.'

export interface ImportQueueProps {
  sources: readonly ImportSourceSummary[]
  /** false when the queue could not be read. */
  ok?: boolean
}

export function ImportQueue({ sources, ok = true }: ImportQueueProps): React.JSX.Element {
  return (
    <Panel title="Queue" actions={<QueueRefresh />} className={styles.queue}>
      {!ok ? (
        <StateBlock kind="error" title="ARCHIVE OFFLINE — the queue could not be read.">
          <p>Try Refresh in a moment.</p>
        </StateBlock>
      ) : sources.length === 0 ? (
        <StateBlock kind="empty" title={EMPTY_QUEUE_TITLE} />
      ) : (
        <ol className={styles.queueList} data-import-queue="">
          {sources.map((source) => (
            <li key={source.id} className={styles.queueItem} data-source-id={source.id} data-status={source.status}>
              <div className={styles.queueHead}>
                <span className={styles.filename}>{source.filename}</span>
                <Badge tone={STATUS_TONE[source.status]}>{STATUS_LABEL[source.status]}</Badge>
              </div>
              <dl className={styles.meta}>
                <div><dt>Size</dt><dd>{formatBytes(source.byteSize)}</dd></div>
                <div><dt>Received</dt><dd>{formatTime(source.createdAt)}</dd></div>
                <div><dt>Processed</dt><dd>{formatTime(source.processedAt)}</dd></div>
                <div><dt>Via</dt><dd>{source.origin === 'cli' ? 'command line' : 'upload'}</dd></div>
              </dl>
              {source.result ? (
                <p className={styles.result} data-source-result="">{formatResult(source.result)}</p>
              ) : null}
              {source.error ? (
                <p className={styles.error} data-source-error="">{source.error}</p>
              ) : null}
              {source.status === 'pending' || source.status === 'failed' ? (
                <RemoveSourceButton id={source.id} filename={source.filename} />
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </Panel>
  )
}
