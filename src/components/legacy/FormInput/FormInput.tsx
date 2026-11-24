'use client';

import styles from "./FormInput.module.scss";

import { useEffect, useRef, useState, type ChangeEvent } from "react";

export default function FormInput({keyword, setKeyword}: {keyword: string, setKeyword: (keyword: string) => void}) {
    const [inputValue, setInputValue] = useState(keyword);

    useEffect(() => {
        setInputValue(keyword);
    }, [keyword]);

    // use-debounce was removed from the project; the same 500 ms trailing debounce by hand
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => () => { if(timer.current) clearTimeout(timer.current); }, []);
    const debounced = (value: string) => {
        if(timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => {
            if(value.trim() !== '') {
                setKeyword(value);
            }
        }, 500);
    };

    const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
        setInputValue(event.target.value);
        debounced(event.target.value);
    }

    return (
        <input
            type="text"
            value={inputValue}
            placeholder="Ask X'aro"
            onChange={handleInputChange}
            className={styles.askXaro}>
        </input>
    );
}