import { notFound } from "next/navigation";

import { LEGACY_KEYS } from "@/lib/data/legacy-keys";

import { getLegacyRow } from "@/components/legacy/adapters";
import Main from "@/components/legacy/Main/Main";
import SearchResult from "@/components/legacy/SearchResult/SearchResult";

export default async function ShipRecordDisplay({ params }: PageProps<'/ship_record/[record_id]'>) {
    const record_info = await params;
    const data = await getLegacyRow(LEGACY_KEYS.record, record_info.record_id);
    if (!data) notFound();

    return (
        <Main>
            <SearchResult data={data} editable={true}/>
        </Main>
    );
}
