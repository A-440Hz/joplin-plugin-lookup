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

function escapeHtml(text: string): string {
	return String(text ?? '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function renderHistoryItem(item: LookupItem, index: number): string {
	const descriptorHtml = item.descriptor
		? `<span class="lookup-item__descriptor"> - "${escapeHtml(item.descriptor)}"</span>`
		: '';

	const meaningsHtml = item.meanings && item.meanings.length > 0
		? item.meanings.map((meaning, meaningIndex) => {
			const posHtml = meaning.partOfSpeech
				? `<span class="lookup-meaning__pos">${escapeHtml(meaning.partOfSpeech)}</span>`
				: '';
			const definitionsHtml = meaning.definitions.map((definition, defIndex) => `
				<div class="lookup-definition">
					<div class="lookup-definition__title">definition ${defIndex}</div>
					<p class="lookup-definition__text">${escapeHtml(definition.definition)}</p>
				</div>`).join('');
			return `
				<section class="lookup-meaning">
					<div class="lookup-meaning__title">meaning ${meaningIndex} ${posHtml}</div>
					${definitionsHtml}
				</section>`;
		}).join('')
		: `<p class="lookup-item__error">${escapeHtml(item.descriptor || 'No results')}</p>`;

	return `
		<article class="lookup-item" data-item-index="${index}">
			<header class="lookup-item__header">
				<h3 class="lookup-item__title">
					<span class="lookup-item__query">${escapeHtml(item.query)}</span>${descriptorHtml}
				</h3>
			</header>
			<div class="lookup-item__body">${meaningsHtml}</div>
			<footer class="lookup-item__source">${escapeHtml(item.source)}</footer>
		</article>`;
}

function getLookupHtmlContent(): string {
	const totalItems = fullHistory.length;
	const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
	const currentPageInfo = totalItems > 0 ? `Page ${currentPage + 1} / ${totalPages}` : 'No history';
	const startIndex = currentPage * pageSize;
	const endIndex = startIndex + pageSize;
	const visibleItems = fullHistory.slice(startIndex, endIndex);
	const itemsHtml = visibleItems.length > 0
		? visibleItems.map((item, index) => renderHistoryItem(item, startIndex + index)).join('')
		: '<p class="lookup-empty">No lookup history yet.</p>';

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
					<span class="lookup-topbar__page-info">${currentPageInfo}</span>
				</div>
			</div>
			<div class="lookup-list">${itemsHtml}</div>
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
