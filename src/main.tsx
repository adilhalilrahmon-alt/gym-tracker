// iOS web apps opened from the Home Screen sometimes report a viewport shorter than the
// screen (by the status-bar height), leaving an empty strip under the tab bar.
// Size the app to the real screen in that case.
function fitHeight() {
  const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
  const portrait = innerHeight >= innerWidth;
  const screenH = portrait ? Math.max(screen.width, screen.height) : Math.min(screen.width, screen.height);
  const h = standalone ? Math.max(innerHeight, screenH) : innerHeight;
  document.documentElement.style.setProperty('--app-h', `${h}px`);
}
fitHeight();
addEventListener('resize', fitHeight);
addEventListener('orientationchange', () => setTimeout(fitHeight, 300));

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';
import { startSync } from './lib/sync';

startSync();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
