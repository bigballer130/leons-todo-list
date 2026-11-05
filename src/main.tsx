import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { startReminders } from './reminders';
import { startSync } from './sync';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {
    /* notifications fall back to the in-page API */
  });
}
startReminders();
startSync();
