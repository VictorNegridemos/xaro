"use client";

import type { ReactNode } from "react";

import styles from "./BottomPanel.module.scss";

export default function BottomPanel({children}: {children: ReactNode}) {
    return (
        <div className={styles.askXaroContainer}>
            {children}
        </div>
    );
}