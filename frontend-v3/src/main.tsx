/**
 * main.tsx — Application entry point.
 */

import React from 'react';

import { AllCommunityModule, ModuleRegistry } from 'ag-grid-community';
import ReactDOM from 'react-dom/client';
import '@patternfly/react-core/dist/styles/base.css';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-quartz.css';

// Register all AG Grid Community modules globally
ModuleRegistry.registerModules([AllCommunityModule]);

import App from './App';
import './styles/ag-grid-ha.css';
import './styles/global.css';
import './styles/patternfly-overrides.css';
import './styles/tokens.css';
import './styles/foundation.css';
import './components/ha-auth-container/HaAuthContainer.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element #root not found');

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
