import joplin from 'api';
import { ViewHandle } from 'api/types';
import { clearHistory, LookupItem, model } from './model';

let lookupPanelHandle: ViewHandle;
let fullHistory: LookupItem[] = [];
let currentPage = 0;
let pageSize = 8;

async function loadHistoryFromSettings(): Promise<void> {
	fullHistory = await joplin.settings.value(model.lookupHistory) as LookupItem[] || [];
	pageSize = await joplin.settings.value(model.resultsPerPage) as number;
}

export async function refreshLookupPanel(): Promise<void> {
	if (!lookupPanelHandle) return;

	const totalItems = fullHistory.length;
	const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
	currentPage = Math.min(currentPage, totalPages - 1);
	const items = fullHistory.slice(currentPage * pageSize, (currentPage + 1) * pageSize);

	joplin.views.panels.postMessage(lookupPanelHandle, {
		type: 'update',
		items,
		page: currentPage,
		totalPages,
		pageSize,
		totalItems,
	});
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

async function handlePanelMessage(message: { type: string; page?: number; pageSize?: number }): Promise<void> {
	switch (message.type) {
	case 'setPage': {
		const totalPages = Math.max(1, Math.ceil(fullHistory.length / pageSize));
		const page = Math.max(0, Math.min(message.page ?? 0, totalPages - 1));
		currentPage = page;
		await refreshLookupPanel();
		break;
	}
	case 'setPageSize': {
		const newSize = Math.max(1, message.pageSize ?? pageSize);
		pageSize = newSize;
		await joplin.settings.setValue(model.resultsPerPage, newSize);
		currentPage = 0;
		await refreshLookupPanel();
		break;
	}
	case 'clearHistory': {
		await clearHistory();
		fullHistory = [];
		currentPage = 0;
		await refreshLookupPanel();
		break;
	}
	}
}

export async function createLookupPanel(): Promise<ViewHandle> {
	lookupPanelHandle = await joplin.views.panels.create('lookupPanel');

	await joplin.views.panels.setHtml(lookupPanelHandle, '<div id="lookup-root"></div>');
	await joplin.views.panels.addScript(lookupPanelHandle, './webview.js');
	await joplin.views.panels.addScript(lookupPanelHandle, './webview.css');

	await joplin.views.panels.onMessage(lookupPanelHandle, handlePanelMessage);

	await loadHistoryFromSettings();
	currentPage = 0;
	await refreshLookupPanel();

	return lookupPanelHandle;
}
