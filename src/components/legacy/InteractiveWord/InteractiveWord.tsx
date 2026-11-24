'use client'

import styles from "./InteractiveWord.module.scss";

export default function InteractiveWord({word, searchForWord}: {word: string, searchForWord: (word: string) => void}) {
    const searchForCurrentWord = () => {
        searchForWord(word);
    }

    return (
        <span onClick={searchForCurrentWord} className={styles.InteractiveWord}>
            {word}
        </span>
    );
}