"use client";

import styles from "./TopPanel.module.scss";

import { useSwipeable } from "react-swipeable";

import type { ReactNode } from "react";

import Button from "../Button/Button";

interface TopPanelProps {
    children: ReactNode;
    panelFocused: string;
    focusPanel: (position: string) => void;
}

export default function TopPanel({children, panelFocused, focusPanel}: TopPanelProps) {
    const swipeTopHandlers = useSwipeable({
        onSwipedDown: () => {
            focusPanel('top');
        },
    });

    const swipeBottomHandlers = useSwipeable({
        onSwipedUp: () => {
            focusPanel('');
        },
    });

    const createExpansionStyles = () => {
        let expandedStyles = '';
        if(panelFocused === 'top'){
            expandedStyles = styles.expandedTopPanel ?? '';
        }

        return expandedStyles;
    }
    const expandedStyle = createExpansionStyles();
    const topPanelStyles = `
            ${styles.TopPanel}  
            ${expandedStyle}   
    `;

    // Position that would hide the panel
    const unfocusPanel = () => {
        focusPanel('');
    }

    return (
        <>
            <div className={topPanelStyles} >
                {children}
                <Button type={'onclick'} action={unfocusPanel} text={'<'}/>
            </div>
            <div className={styles.TopSwipableArea} {...swipeTopHandlers}></div>
            <div className={styles.BottomSwipableArea} {...swipeBottomHandlers}></div>
        </>
    );
}