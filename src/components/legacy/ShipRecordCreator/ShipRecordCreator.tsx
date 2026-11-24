'use client'

import styles from "./ShipRecordCreator.module.scss";

import { useState, type ChangeEvent } from "react";

import Button from "../Button/Button";
import type { LegacyRecordRow } from "../adapters";

// Step 1 of the overhaul: the old create/edit API routes are gone and the new entry form
// arrives in Step 3. Until then this form submits nothing (K17).
const WRITES_OFFLINE = 'Writes are offline during refit';

export default function ShipRecordCreator({ predefinedData }: { predefinedData?: LegacyRecordRow }) {
    const editMode = predefinedData !== undefined;

    const [title, setTitle] = useState(predefinedData ? predefinedData.title : '');
    const [data, setData] = useState(predefinedData ? predefinedData.text : '');
    const [notice, setNotice] = useState(false);

    const handleTitleChange = (event: ChangeEvent<HTMLInputElement>) => {
        setTitle(event.target.value);
    };
    const handleDataChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
        setData(event.target.value);
    };

    const showOfflineNotice = () => {
        setNotice(true);
    };

    const creationResultClass = notice ? `${styles.createdMessageVisible} ${styles.createdMessage}` : styles.createdMessage;

    return (
        <div className={styles.mainContainer}>
            <h2>{editMode ? 'Edit record' : 'Add record to X\'aro'}</h2>
            <div className={styles.creatorContainer}>
                <input
                    type="text"
                    value={title}
                    placeholder="Title"
                    onChange={handleTitleChange}
                    className={styles.formInputText}
                />
                <textarea placeholder="Data"
                    onChange={handleDataChange}
                    className={styles.formTextArea}
                    value={data}
                    rows={10}
                >
                </textarea>
            </div>
            <div className={styles.buttonsContainer}>
                <Button text={`Back`}/>
                <Button type={'onclick'} action={showOfflineNotice} text={editMode ? 'Update' : 'Create'}/>
            </div>
            <div className={creationResultClass} role="status">{WRITES_OFFLINE}</div>
        </div>
    );
}
