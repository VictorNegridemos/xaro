import styles from "./KodningReserves.module.scss";

export default function KodningReserves({reservePercentage}: {reservePercentage: string}) {
    return (
        <div className={styles.kodningReserves}>
            <div className={styles.kodningTotal}>
                <div className={styles.kodningCurrentBar} style={{width: reservePercentage}}></div>
                <div className={styles.kondingCurrentText}>{reservePercentage} / 100%</div>
            </div>
        </div>
    );
}