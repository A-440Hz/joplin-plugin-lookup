import joplin from 'api';
import { ViewHandle } from 'api/types';
import { clearHistory, LookupItem, model } from './model';

let lookupPanelHandle: ViewHandle;
let fullHistory: LookupItem[] = [];
let currentPage = 0;
let pageSize = 8;

async function loadHistoryFromSettings(): Promise<void> {
	fullHistory = (await joplin.settings.value(model.lookupHistory) as LookupItem[]) || [];
	pageSize = await joplin.settings.value(model.resultsPerPage) as number;
}

export async function refreshLookupPanel(): Promise<void> {
	if (!lookupPanelHandle) return;

	const totalItems = fullHistory.length;
	const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
	currentPage = Math.min(currentPage, totalPages - 1);
	await joplin.views.panels.setHtml(lookupPanelHandle, getLookupHtmlContent());

	// Send structured data to the webview so it can render and handle interactions.
	const startIndex = currentPage * pageSize;
	const endIndex = startIndex + pageSize;
	const visibleItems = fullHistory.slice(startIndex, endIndex);
	const panelData = {
		type: 'update',
		items: visibleItems,
		page: currentPage,
		pageSize: pageSize,
		totalItems: totalItems,
		totalPages: totalPages,
	};

	try {
		await joplin.views.panels.postMessage(lookupPanelHandle, panelData);
		console.log('Posted update message to lookup panel', panelData.page, panelData.pageSize, panelData.totalItems);
	} catch (err) {
		console.warn('Failed to postMessage to lookup panel:', err);
	}
}

export async function reloadHistoryFromSettings(): Promise<void> {
	await loadHistoryFromSettings();
	currentPage = 0;
	await refreshLookupPanel();
}

export async function showLookupPanel(): Promise<void> {
	if (lookupPanelHandle) {
		await joplin.views.panels.show(lookupPanelHandle, true);
	}
}

function getLookupHtmlContent(): string {
	return `
<!DOCTYPE html>
<html>
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body>
	<div id="lookup-root">
		<div class="lookup-panel">
			<div class="lookup-topbar">
				<div class="lookup-topbar__nav">
					<button id="lookup-prev-page" class="lookup-prev-page" type="button" title="Previous page">←</button>
					<button id="lookup-next-page" class="lookup-next-page" type="button" title="Next page">→</button>
					<span class="lookup-topbar__page-info"></span>
				</div>
			</div>
			<div class="lookup-list"></div>
		</div>
	</div>
</body>
</html>
	`;
}

function setupLookupMessageHandler(): void {
	joplin.views.panels.onMessage(lookupPanelHandle, async (message: any) => {
		console.log('Plugin received message:', message);

		try {
			switch (message.message) {
			case 'ready':
				await reloadHistoryFromSettings();
				return { success: true };

			case 'setPage':
				var totalPages = Math.max(1, Math.ceil(fullHistory.length / pageSize));
				var page = Math.max(0, Math.min(message.page ?? 0, totalPages - 1));
				currentPage = page;
				await refreshLookupPanel();
				return { success: true };

			case 'setPageSize':
				var newSize = Math.max(1, message.pageSize ?? pageSize);
				pageSize = newSize;
				await joplin.settings.setValue(model.resultsPerPage, newSize);
				currentPage = 0;
				await refreshLookupPanel();
				return { success: true };

			case 'clearHistory':
				await clearHistory();
				fullHistory = [];
				currentPage = 0;
				await refreshLookupPanel();
				return { success: true };

			default:
				console.warn('Unknown message type:', message.message);
				return { error: 'Unknown message type' };
			}
		} catch (err) {
			console.error('Error handling panel message:', err);
			return { error: err && typeof err === 'object' && 'message' in err ? (err as Error).message : 'Internal error' };
		}
	});
}

export async function createLookupPanel(): Promise<ViewHandle> {
	lookupPanelHandle = await joplin.views.panels.create('lookupPanel');
	console.log('createLookupPanel started');

	setupLookupMessageHandler();
	console.log('setupLookupMessageHandler registered');

	await joplin.views.panels.setHtml(lookupPanelHandle, getLookupHtmlContent());
	console.log('HTML content set');

	await joplin.views.panels.addScript(lookupPanelHandle, './webview.css');
	console.log('Webview CSS added');

	await joplin.views.panels.addScript(lookupPanelHandle, './webview.js');
	console.log('Webview JS added');

	return lookupPanelHandle;
}
