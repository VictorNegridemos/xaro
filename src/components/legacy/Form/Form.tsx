'use client';

import { useState, useEffect, useContext } from "react";

import FormInput from "../FormInput/FormInput";
import FormResults from "../FormResults/FormResults";

import { KeywordContext } from "../KeywordContext";
import type { LegacySearchGroup } from "../adapters";

export default function Form() {
    const [searchResults, setSearchResults] = useState<LegacySearchGroup[]>([]);
    const { keyword, setKeyword } = useContext(KeywordContext);

    useEffect(() => {
        async function getSearchResults (keyword: string) {
            const response = await fetch('/api/search', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ keyword })
            });
            const response_data = await response.json() as LegacySearchGroup[];
            setSearchResults(response_data);
        }
        if(keyword.length) {
            getSearchResults(keyword);
        }
    }, [keyword]);
    
    return (
        <div>
            <FormResults results={searchResults}/>
            <FormInput keyword={keyword} setKeyword={setKeyword}/>
        </div>
    );
}