/* @refresh reload */
import { render } from 'solid-js/web';
import './styles/global.css';
import App from './App';
import { registerNotificationClientScope } from './lib/notifications';
import { applyPerformanceProfile } from './lib/performance';

const root = document.getElementById('root');
if (!root) throw new Error('missing #root element');

applyPerformanceProfile();
render(() => <App />, root);

if ('serviceWorker' in navigator) {
	void registerNotificationClientScope();
	navigator.serviceWorker.addEventListener('controllerchange', () => {
		void registerNotificationClientScope();
	});
}
