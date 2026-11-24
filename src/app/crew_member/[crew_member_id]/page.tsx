import { notFound } from "next/navigation";

import { LEGACY_KEYS } from "@/lib/data/legacy-keys";

import { getLegacyRow } from "@/components/legacy/adapters";
import Main from "@/components/legacy/Main/Main";
import SearchResult from "@/components/legacy/SearchResult/SearchResult";

export default async function CrewMemberDisplay({ params }: PageProps<'/crew_member/[crew_member_id]'>) {
    const data_info = await params;
    const data = await getLegacyRow(LEGACY_KEYS.crew, data_info.crew_member_id);
    if (!data) notFound();

    return (
        <Main>
            <SearchResult data={data} editable={false}/>
        </Main>
    );
}
