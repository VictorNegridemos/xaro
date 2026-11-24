import styles from "./FormResults.module.scss";

import Link from "next/link";

import type { LegacySearchGroup } from "../adapters";

export default function FormResults({results = []}: {results?: LegacySearchGroup[]}) {
    const displayResults = () => {
        let validResults = false;
        const displayedResults = results.map(search_result => {
            if(search_result.data.length) {
                validResults = true;
                return (
                    <div key={search_result.source}>
                        {search_result.data.map(search_result_data => {
                            return <Link key={search_result_data.id} href={`/${search_result.source}/${search_result_data.id}`} className={styles.searchResult}>{String((search_result_data as unknown as Record<string, unknown>)[search_result.displayProperty] ?? '')}</Link>;
                        })}
                    </div>
                )
            }
        });

        if(results.length && !validResults) {
            return <div><a href='#' className={styles.searchResult}>No results</a></div>;
        } else {
            return displayedResults;
        }
    }

    return (
        <div className={styles.resultsContainer}>
            {displayResults()}
        </div>
    );
}