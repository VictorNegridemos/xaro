"use client";

import styles from "./ShipPanel.module.scss";
import ShipSystem from "../ShipSystem/ShipSystem";
import KodningReserves from "../KodningReserves/KodningReserves";
import type { LegacySubsystemRow } from "../adapters";
import { KODNING_RESERVE } from "@/lib/ship-constants";

export default function ShipPanel({subsystems, selectSubSystem}: {subsystems: LegacySubsystemRow[], selectSubSystem: (id: number) => void}) {

    // The six tiles now come from the data layer (first system per category, K12); no ids in code
    const subsystem_shortlist = subsystems;
    
    return (
        <div className={styles.ShipPanel}>
            <div className={styles.subSystemDisplay}>
                {subsystem_shortlist.map(subsystem => (
                    <ShipSystem
                        key={subsystem.id}
                        selectSubSystem={selectSubSystem} 
                        type={subsystem.type}
                        systemStatus={subsystem.status}
                        id={subsystem.id}
                    />
                ))}
            </div>
            
            <KodningReserves reservePercentage={KODNING_RESERVE}/>
            <div className={styles.cornerStyle}/>
        </div>
    );
}