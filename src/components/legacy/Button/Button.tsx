"use client";

import type { MouseEventHandler } from "react";

import styles from "./Button.module.scss";

import Link from "next/link";

import { useRouter } from 'next/navigation'

interface ButtonProps {
    type?: string;
    action?: string | MouseEventHandler<HTMLAnchorElement>;
    text: string;
    extraClass?: string;
}

export default function Button({type = '', action = '', text, extraClass}: ButtonProps) {
    const router = useRouter()

    const buildButton = () => {
        const classes = `${styles.DefaultButton} ${extraClass ? styles[extraClass] : ''}`;

        if(type === 'link') {
            return <Link href={typeof action === 'string' ? action : ''} className={classes}>{text}</Link>
        } else if(type === 'onclick') {
            return <a href="#" onClick={typeof action === 'function' ? action : undefined} className={classes}>{text}</a>
        } else {
            return <a href="#" onClick={() => router.back()} className={classes}>{text}</a>
        }
    }

    return (
        buildButton()
    );
}