import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Gracefully handle HMR/WebSocket connectivity errors and unhandled rejections inside sandboxed iframe environment
if (typeof window !== 'undefined') {
  const isWebSocketError = (err: any): boolean => {
    if (!err) return false;
    
    // Check if it's a string
    if (typeof err === 'string') {
      const lower = err.toLowerCase();
      return (
        lower.includes('websocket') ||
        lower.includes('closed without opened') ||
        lower.includes('failed to connect to websocket')
      );
    }
    
    // Check properties of the error, event, or reason
    const message = err.message || '';
    const reasonStr = err.reason || '';
    const name = err.name || '';
    const type = err.type || '';
    const constructorName = err.constructor?.name || '';
    
    const combinedText = `${message} ${reasonStr} ${name} ${type} ${constructorName}`.toLowerCase();
    
    if (
      combinedText.includes('websocket') ||
      combinedText.includes('closed without opened') ||
      combinedText.includes('closeevent')
    ) {
      return true;
    }
    
    // Check if target is a WebSocket
    if (err.target && (err.target instanceof WebSocket || err.target.constructor?.name === 'WebSocket')) {
      return true;
    }
    
    return false;
  };

  const handleGlobalError = (event: ErrorEvent) => {
    if (isWebSocketError(event.error) || isWebSocketError(event.message) || isWebSocketError(event)) {
      event.preventDefault();
      event.stopPropagation();
      console.warn('[Vite HMR/WebSocket Error (Handled Gracefully)]:', event.message || event.error || event);
    }
  };

  const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    if (isWebSocketError(reason) || isWebSocketError(event)) {
      event.preventDefault();
      event.stopPropagation();
      console.warn('[Vite HMR/WebSocket Unhandled Rejection (Handled Gracefully)]:', reason);
    }
  };

  window.addEventListener('error', handleGlobalError, true);
  window.addEventListener('unhandledrejection', handleUnhandledRejection, true);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
