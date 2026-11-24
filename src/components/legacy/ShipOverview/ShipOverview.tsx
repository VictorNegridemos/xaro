"use client";

import styles from "./ShipOverview.module.scss";

import { useState, useEffect, type MouseEvent, type ReactNode } from "react";

import type { LegacySubsystemRow } from "../adapters";

export default function ShipOverview({subsystems, preselectedSubsystem}: {subsystems: LegacySubsystemRow[], preselectedSubsystem: number | ''}) {
    const [selectedTab, setSelectedTab] = useState<string>('');

    useEffect(() => {
        setSelectedTab(String(preselectedSubsystem));
    }, [preselectedSubsystem])
    
    const selectSubSystem = (event: MouseEvent<HTMLDivElement>) => {
        if(event.currentTarget.getAttribute('data-subsystem') === selectedTab) {
            setSelectedTab('');
        } else {
            setSelectedTab(event.currentTarget.getAttribute('data-subsystem') ?? '');
        }
    }

    // TODO: move to a location where it can be accessed from both here and ShipSystem because it is used in both places
    const displayStatus = (status: string) => {
        let status_display: ReactNode;
        if(status === 'Online') {
            status_display = <span className={styles.online}>Online</span>;
        } else {
            status_display = <span className={styles.offline}>Offline</span>;
        }

        return status_display;
    }

    return (
        <div className={styles.ShipOverview}>
            <h1 className={styles.title}>Ship Subsystems</h1>
            {subsystems.map(subsystem => (
                <div onClick={selectSubSystem} data-subsystem={subsystem.id} key={subsystem.id} className={`${styles.shipSubSystem} ${String(subsystem.id) === selectedTab ? styles.selected : ''}`}>
                    <div className={styles.basicInfo}>
                        <h2>{subsystem.type}</h2>
                        <h2>{subsystem.current}</h2>
                        <h2>{displayStatus(subsystem.status)}</h2>
                    </div>
                    <div className={styles.detailedInfo}>
                        <p>Current capability: <span>{subsystem.value}</span></p>
                        <p>{subsystem.details}</p>
                    </div>
                </div>
            ))}
        </div>
    );
}