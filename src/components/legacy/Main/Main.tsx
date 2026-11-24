import type { ReactNode } from "react";

import "../legacy-globals.scss";

// DB operations (new tables, through the typed data layer)
import { getShellData } from "@/lib/data/shell";
import { crewCardToLegacy, systemCardToLegacy } from "../adapters";

// Client components
import MainPanel from "../MainPanel/MainPanel";

export default async function Main({ children }: { children: ReactNode }) {

    const shell = await getShellData();

    const data = {
        crewMembers: shell.crew.map(crewCardToLegacy),
        subsystems: shell.systems.map(systemCardToLegacy),
        barSubsystems: shell.barSystems.map(systemCardToLegacy),
    };

    return (
        <div className="App">
            <div className='main'>
                <MainPanel data={data}>{children}</MainPanel>
            </div>
        </div>
    );
}
