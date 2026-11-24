import styles from "./CelestialBodyDetails.module.scss";

export default function CelestialBodyDetails() {
    return (
        <div className={styles.planetInfo}>
            <h2 className={styles.title}>Current location</h2>
            <p className={styles.detail}>Dimension: <span>UNKNOWN</span></p>
            <p className={styles.detail}>Observable universe: <span>UNKNOWN</span></p>
            <p className={styles.detail}>Galaxy: <span>Damortia</span></p>
            <p className={styles.detail}>System: <span>N/A</span></p>
            <p className={styles.detail}>Planet: <span>N/A</span></p>
            <p className={styles.detail}>Temperature: <span>N/A</span></p>
            <p className={styles.detail}>Ground composition: <span>N/A</span></p>
            <p className={styles.detail}>Atmospheric composition: <span>N/A</span></p>
            <p className={styles.detail}>Life signs: <span>NONE</span></p>
            <p className={styles.detail}>Urbanization: <span>NONE</span></p>
            <p className={styles.detail}>Valuable resources: <span className={styles.valuableResource}>NONE</span></p>
        </div>
    );
}