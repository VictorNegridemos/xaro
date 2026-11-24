// Frame of the error and not-found pages: the tendril drawing creeping over a fault readout (plan 7.6).
import Image from 'next/image'
import type { ReactNode } from 'react'
import tendrils from '@/assets/tendrils.webp'
import styles from './FaultFrame.module.scss'

export function FaultFrame({ code, children }: { code: string; children: ReactNode }): React.JSX.Element {
  return (
    <div className={styles.fault}>
      <Image src={tendrils} alt="" aria-hidden="true" sizes="(min-width: 1000px) 48rem, 100vw" quality={60} className={styles.tendrils} />
      <p className={styles.code} aria-hidden="true">{code}</p>
      <div className={styles.content}>{children}</div>
    </div>
  )
}
