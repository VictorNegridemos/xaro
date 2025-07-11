import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL);

// DB operations

// Insert record

export async function createRecord(new_record_title, new_record_text) {
    const insertResults = await sql`
        INSERT INTO ship_records (title, text)
        VALUES (${new_record_title}, ${new_record_text})
    `;

    return insertResults;
}

// Update record

export async function updateRecord(record_id, new_record_title, new_record_text) {
    const insertResults = await sql`
        UPDATE ship_records
        SET title = ${new_record_title}, text = ${new_record_text}
        WHERE id = ${record_id}
    `;

    return insertResults;
}

// Get many

export async function getCrew() {
    const crewMembers = await sql`
        SELECT * FROM crew_members ORDER BY id ASC
    `;

    return crewMembers;
}

export async function getSubsystems() {
    const subsystems = await sql`
        SELECT * FROM ship_subsystems ORDER BY id ASC
    `;

    return subsystems;
}

// Get one by id

export async function getCrewMemberById(id) {
    const crewMember = await sql`
        SELECT * FROM crew_members WHERE id = ${id}
    `;

    return crewMember[0];
}

export async function getShipRecordById(id) {
    const crewMember = await sql`
        SELECT * FROM ship_records WHERE id = ${id}
    `;

    return crewMember[0];
}

export async function getSubsystemById(id) {
    const crewMember = await sql`
        SELECT * FROM ship_subsystems WHERE id = ${id}
    `;

    return crewMember[0];
}

// Get many by any column

// TODO handle the search in different tables better or at least split into multiple functions
export async function globalSearch(keyword) {
    let results = [];

    results.push(await searchCrewMembers(keyword));
    results.push(await searchSubsystems(keyword));
    results.push(await searchShipRecords(keyword));

    return results;
}

async function searchCrewMembers(keyword) {
    const results = await sql`
        SELECT * FROM crew_members WHERE first_name ILIKE ${`%${keyword}%`}
        OR last_name ILIKE ${`%${keyword}%`}
        OR crew_rank ILIKE ${`%${keyword}%`}
        OR race ILIKE ${`%${keyword}%`}
        OR composition ILIKE ${`%${keyword}%`}
        OR current_status ILIKE ${`%${keyword}%`}
        OR expertise ILIKE ${`%${keyword}%`}
        OR (first_name || ' ' || last_name) ILIKE ${`%${keyword}%`}
        LIMIT 10
    `;

    return {
        source: 'crew_member',
        displayProperty: 'first_name',
        data: results
    }
}

async function searchSubsystems(keyword) {
    const results = await sql`
        SELECT * FROM ship_subsystems WHERE type ILIKE ${`%${keyword}%`}
        OR status ILIKE ${`%${keyword}%`}
        OR current ILIKE ${`%${keyword}%`}
        OR value ILIKE ${`%${keyword}%`}
        OR details ILIKE ${`%${keyword}%`}
        LIMIT 10
    `;

    return {
        source: 'subsystem',
        displayProperty: 'current',
        data: results
    }
}

async function searchShipRecords(keyword) {
    const results = await sql`
        SELECT * FROM ship_records WHERE title ILIKE ${`%${keyword}%`}
        OR text ILIKE ${`%${keyword}%`}
        LIMIT 10
    `;

    return {
        source: 'ship_record',
        displayProperty: 'title',
        data: results
    }
}