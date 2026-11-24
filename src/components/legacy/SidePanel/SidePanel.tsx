"use client";

import styles from "./SidePanel.module.scss";

import type { ReactNode } from "react";

import Button from "../Button/Button";

interface SidePanelProps {
    children: ReactNode;
    position: 'left' | 'right';
    panelFocused: string;
    focusPanel: (position: string) => void;
}

export default function SidePanel({ children, position, panelFocused, focusPanel }: SidePanelProps) {
    
    const determineHiddenToggleVisibility = () => {
        let hidden = false;
        if(panelFocused !== '' && panelFocused !== 'bottom'){
            hidden = true;
        }

        return hidden;
    }

    const sidePanelStyles = `
        ${styles.SidePanel}  
        ${panelFocused === position ? styles.ExpandedPanel : ''}   
        ${position === 'left' ? styles.leftPanel : styles.rightPanel}
    `;
    const mobileToggleIndicator = `
        ${styles.mobileToggle}
        ${ position === 'left' ? styles.leftToggle : styles.rightToggle}
        ${determineHiddenToggleVisibility() ? styles.hiddenToggle : ''}
    `;
    const focusCurrentPanel = () => {
        const currentPanelFocus = position === 'left' ? 'left' : 'right';
        focusPanel(currentPanelFocus);
    }
    // Position that would hide the panel
    const unfocusPanel = () => {
        focusPanel('');
    }

    return (
        <div className={sidePanelStyles}>
            {children}
            <div onClick={focusCurrentPanel} className={mobileToggleIndicator}>
                {position === 'left' ? 'Crew' : 'Location'}
            </div>
            <Button type={'onclick'} action={unfocusPanel} text={'<'}/>
        </div>
    ); 
}