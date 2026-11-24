import { notFound } from "next/navigation";

import { LEGACY_KEYS } from "@/lib/data/legacy-keys";

import { getLegacyRow } from "@/components/legacy/adapters";
import Main from "@/components/legacy/Main/Main";
import ShipRecordCreator from "@/components/legacy/ShipRecordCreator/ShipRecordCreator";

export default async function EditShipRecord({ params }: PageProps<'/edit_ship_record/[record_id]'>) {
    const record_info = await params;
    const data = await getLegacyRow(LEGACY_KEYS.record, record_info.record_id);
    if (!data || !('title' in data)) notFound();

    return (
        <Main>
            <ShipRecordCreator predefinedData={data}/>
        </Main>
    );
}
