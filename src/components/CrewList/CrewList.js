import { useState } from "react";

import CrewMember from "../CrewMember/CrewMember";

import temp_data from '../../data/data.json';

export default function CrewList({objectToArray}) {
    const [expandedMemberId, setExpandedMemberId] = useState();

    const toggleCrewMember = (id) => {
        id !== expandedMemberId ? setExpandedMemberId(id) : setExpandedMemberId();
    }

    const data = objectToArray(temp_data.crew_members);

    return (
        <div>
            {data.map((crew_member) => (
                <CrewMember
                    toggleCrewMember={toggleCrewMember}
                    expanded={expandedMemberId === crew_member.id}
                    key={crew_member.id}
                    data={crew_member}
                />
            ))}
        </div>
    );
}