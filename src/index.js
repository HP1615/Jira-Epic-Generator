import React from 'react';
import ReactDOM from 'react-dom/client';
import EpicGenerator from './EpicGenerator';
import './index.css';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <EpicGenerator />
  </React.StrictMode>
);