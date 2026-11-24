import type { ReactNode } from "react";

import styles from "./ShipSystem.module.scss";

interface ShipSystemProps {
    selectSubSystem: (id: number) => void;
    type: string;
    systemStatus: string;
    id: number;
}

export default function ShipSystem({selectSubSystem, type, systemStatus, id}: ShipSystemProps) {
    const selectClickedSubsystem = () => {
        selectSubSystem(id);
    };

    // TODO: move to a location where it can be accessed from both here and ShipOverview because it is used in both places
    const displayStatus = () => {
        let status_display: ReactNode;
        if(systemStatus === 'Online') {
            status_display = <span className={styles.online}>Online</span>;
        } else {
            status_display = <span className={styles.offline}>Offline</span>;
        }

        return status_display;
    }

    return (
        <div onClick={selectClickedSubsystem} className={styles.shipSystem}>
            <p className={styles.title}>{type}</p>
            {displayStatus()}
        </div>
    );
}