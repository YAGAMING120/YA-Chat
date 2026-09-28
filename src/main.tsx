import { createRoot } from 'react-dom/client';
import App from './App';
import 'highlight.js/styles/github-dark.css';
import 'katex/dist/katex.min.css';
import './styles/index.css';

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root not found');

createRoot(container).render(<App />);
