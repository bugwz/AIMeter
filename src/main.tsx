// Render entry point
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { initializeTheme } from './theme';
import { resolveRuntimeEntry } from './runtimeContext';
import './index.css';

initializeTheme();

async function bootstrap() {
  const runtimeEntry = await resolveRuntimeEntry();

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <BrowserRouter basename={runtimeEntry.basePath === '/' ? undefined : runtimeEntry.basePath}>
        <App />
      </BrowserRouter>
    </React.StrictMode>
  );
}

void bootstrap();
