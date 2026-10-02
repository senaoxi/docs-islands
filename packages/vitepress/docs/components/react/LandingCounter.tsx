import { useState, useSyncExternalStore } from 'react';

interface LandingCounterProps {
  locale?: 'en' | 'zh';
  title: string;
}

// The server snapshot stays static until React hydrates this island.
const unsubscribeHydration = () => {
  // The client snapshot is constant, so there is no store listener to release.
};
const subscribeToHydration = () => unsubscribeHydration;
const clientSnapshot = () => true;
const serverSnapshot = () => false;

export default function LandingCounter({
  locale = 'en',
  title,
}: LandingCounterProps) {
  const [count, setCount] = useState(0);
  const ready = useSyncExternalStore(
    subscribeToHydration,
    clientSnapshot,
    serverSnapshot,
  );
  const chinese = locale === 'zh';

  return (
    <div className="landing-counter" data-hydrated={ready}>
      <h4 className="landing-counter__title">{title}</h4>
      <div className="landing-counter__state">
        <span className="landing-counter__dot" aria-hidden="true" />
        {ready
          ? chinese
            ? 'React 小岛已可交互'
            : 'React island is interactive'
          : chinese
            ? '构建时生成的 HTML'
            : 'Build-time HTML'}
      </div>
      <div className="landing-counter__row">
        <output
          className="landing-counter__value"
          aria-label={chinese ? '计数值' : 'Counter value'}
          aria-live="polite"
        >
          {count}
        </output>
        <div className="landing-counter__actions">
          <button
            type="button"
            disabled={!ready}
            onClick={() => setCount((value) => value + 1)}
            aria-label={chinese ? '计数加一' : 'Add one to the counter'}
          >
            +1
          </button>
          <button type="button" disabled={!ready} onClick={() => setCount(0)}>
            {chinese ? '重置' : 'Reset'}
          </button>
        </div>
      </div>
    </div>
  );
}
