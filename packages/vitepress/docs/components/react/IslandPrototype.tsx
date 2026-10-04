import styles from './IslandPrototype.module.css';

// Original Sunset v2 atlas: 8 × 11 cells, each 192 × 208 px.
// IntegrationWalkthrough supplies route and sprite frames from its one playback clock.
export default function IslandPrototype() {
  return <span className={styles.prototype} aria-hidden="true" />;
}
