"use client";

import styles from "./MainPanel.module.scss";

import { useState, useEffect, type ReactNode } from "react";

import { useSwipeable } from "react-swipeable";

import SidePanel from "../SidePanel/SidePanel";
import TopPanel from "../TopPanel/TopPanel";
import BottomPanel from "../BottomPanel/BottomPanel";

import CrewList from "../CrewList/CrewList";
import CelestialBodyDetails from "../CelestialBodyDetails/CelestialBodyDetails";
import Form from "../Form/Form";
import ShipPanel from "../ShipPanel/ShipPanel";
import ShipOverview from "../ShipOverview/ShipOverview";

import { KeywordContext } from "../KeywordContext";
import type { LegacyCrewRow, LegacySubsystemRow } from "../adapters";

export interface MainPanelData {
    crewMembers: LegacyCrewRow[];
    subsystems: LegacySubsystemRow[];
    barSubsystems: LegacySubsystemRow[];
}

export default function MainPanel({data, children}: {data: MainPanelData, children: ReactNode}) {
    const [panelFocused, setPanelFocused] = useState('');
    const [selectedSubsystem, setSelectedSubsystem] = useState<number | ''>('');

    const [keyword, setKeyword] = useState("");
    const keywordFromContext = { keyword, setKeyword };

    const { ref: documentRef } = useSwipeable({
        onSwipedLeft: () => {
            focusedPanel('right');
        },
        onSwipedRight: () => {
            focusedPanel('left');
        },
        delta: { up: 50, down: 50, left: 25, right: 25 },
        swipeDuration: 200
   });

    // attach swipeable to document
    useEffect(() => {
        documentRef(document as unknown as HTMLElement);
        // Clean up swipeable event listeners
        return () => documentRef(null);
    });

   const focusedPanel = (position: string) => {
        if (panelFocused !== '' && panelFocused !== position) {
            // if one side panel is focused as we swipe to the other side this stop the opposite panel from being focused
            setPanelFocused('');
        }
        else {
            setPanelFocused(position)
        }
    }

    const focusPanel = (positionToFocus: string) => {
        setPanelFocused(positionToFocus);
    }

    const selectSubSystem = (id: number) => {
        setSelectedSubsystem(id);
        focusedPanel('top');
    }

    return (
        <KeywordContext.Provider value={keywordFromContext}>
            <div className={styles.mainContainer}>
                <TopPanel panelFocused={panelFocused} focusPanel={focusPanel}>
                    <ShipOverview subsystems={data.subsystems} preselectedSubsystem={selectedSubsystem}/>
                </TopPanel>
                <SidePanel position='left' panelFocused={panelFocused} focusPanel={focusPanel}>
                    <CrewList crewMembers={data.crewMembers}/>
                </SidePanel>
                <ShipPanel subsystems={data.barSubsystems} selectSubSystem={selectSubSystem}/>

                {children}

                <BottomPanel>
                    <Form/>
                </BottomPanel>

                <SidePanel position='right' panelFocused={panelFocused} focusPanel={focusPanel}>
                    <CelestialBodyDetails/>
                </SidePanel>
            </div>
        </KeywordContext.Provider>
    );
}
