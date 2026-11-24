'use client'

import styles from "./SearchResult.module.scss";

import { useState, useContext } from "react";

import Button from "../Button/Button";
import InteractiveWord from "../InteractiveWord/InteractiveWord";

import { KeywordContext } from "../KeywordContext";

import IsWordInteractive from "../data_functions";
import type { LegacyRow } from "../adapters";

export default function SearchResult({data, editable}: {data: LegacyRow, editable: boolean}) {
    const { setKeyword } = useContext(KeywordContext);
    const title = 'title' in data ? data.title : undefined;
    const [expanded, setExpanded] = useState(false);

    const createInteractiveText = (plainText: string) => {
        const textWordByWord = plainText.split(' ');

        let keyCounter = 0;
        return textWordByWord.map(word => {
            keyCounter++;
            if(word !== title && IsWordInteractive(word)) {
                return <InteractiveWord key={keyCounter} word={word} searchForWord={searchForWord}/>;
            } else {
                return <span key={keyCounter} className={styles.nonInteractiveWord}>{word}</span>;
            }
        });
    }

    const searchForWord = (word: string) => {
        setKeyword(word);
    }

    const displayedData = () => {
        return Object.entries(data).map(([key, value]) => {
            if(key !== 'id') {
                return (
                    <p key={key}>{key.replace('_', ' ')} : <span className={styles.InteractiveText}>{createInteractiveText(String(value))}</span></p>
                )
            }
        })
    }
    
    const expandContainer = () => {
        setExpanded(!expanded);
    }

    return (
        <div className={expanded ? `${styles.SearchContainer} ${styles.ExpandedSearchContainer}`: styles.SearchContainer}>
            <div className={styles.titleSection}>
                <h2>Search results</h2>
            </div>
            <div className={styles.dataSection}>
                {displayedData()}
            </div>
            <div className={styles.buttonsSection}>
                <Button text={`Back`}/>
                { editable ? 
                    <Button type={'link'} action={`\\edit_ship_record\\${data.id}`} text={`Edit`}/> 
                : null}
                <Button type={'onclick'} action={expandContainer} text={`< >`}/>
            </div>
        </div>
    );
}