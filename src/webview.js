/* global webviewApi */

(function() {
	const PAGE_SIZE_OPTIONS = [4, 8, 12, 16, 20];

	/** @type {Map<number, { meaningIndex: number, definitionIndex: number, expanded: boolean }>} */
	const itemState = new Map();

	/** @type {{ items: object[], page: number, totalPages: number, pageSize: number, totalItems: number } | null} */
	let panelData = null;

	const root = document.getElementById('lookup-root');

	function escapeHtml(text) {
		const div = document.createElement('div');
		div.textContent = text;
		return div.innerHTML;
	}

	function getItemState(index) {
		if (!itemState.has(index)) {
			itemState.set(index, { meaningIndex: 0, definitionIndex: 0, expanded: false });
		}
		return itemState.get(index);
	}

	function renderDefinitionContent(definition, meaning) {
		const parts = [];
		parts.push(`<p class="lookup-definition__text">${escapeHtml(definition.definition)}</p>`);

		if (definition.example) {
			parts.push(`<p class="lookup-definition__example"><em>${escapeHtml(definition.example)}</em></p>`);
		}

		if (meaning.synonyms && meaning.synonyms.length > 0) {
			parts.push(`<p class="lookup-synonyms"><span class="lookup-label">Synonyms:</span> ${escapeHtml(meaning.synonyms.join(', '))}</p>`);
		}

		if (meaning.antonyms && meaning.antonyms.length > 0) {
			parts.push(`<p class="lookup-antonyms"><span class="lookup-label">Antonyms:</span> ${escapeHtml(meaning.antonyms.join(', '))}</p>`);
		}

		return parts.join('');
	}

	function renderDefinitionBlock(meaning, defIndex, defCount, showTitle) {
		const definition = meaning.definitions[defIndex];
		if (!definition) return '';

		const titleHtml = showTitle
			? `<button class="lookup-definition__title" type="button" data-action="cycle-definition">definition ${defIndex} <span class="lookup-index">(${defIndex + 1}/${defCount})</span></button>`
			: `<span class="lookup-definition__title-static">definition ${defIndex}</span>`;

		return `<section class="lookup-definition">
			${titleHtml}
			${renderDefinitionContent(definition, meaning)}
		</section>`;
	}

	function renderMeaningBlock(meaning, meaningIndex, meaningCount, state, collapsed) {
		const defCount = meaning.definitions.length;
		const posHtml = meaning.partOfSpeech
			? `<span class="lookup-meaning__pos">${escapeHtml(meaning.partOfSpeech)}</span>`
			: '';

		const titleHtml = collapsed
			? `<button class="lookup-meaning__title" type="button" data-action="cycle-meaning">meaning ${meaningIndex} <span class="lookup-index">(${meaningIndex + 1}/${meaningCount})</span> ${posHtml}</button>`
			: `<span class="lookup-meaning__title-static">meaning ${meaningIndex} ${posHtml}</span>`;

		let definitionsHtml;
		if (collapsed) {
			definitionsHtml = renderDefinitionBlock(meaning, state.definitionIndex, defCount, true);
		} else {
			definitionsHtml = meaning.definitions.map((_, i) =>
				renderDefinitionBlock(meaning, i, defCount, false)
			).join('');
		}

		return `<section class="lookup-meaning">
			${titleHtml}
			${definitionsHtml}
		</section>`;
	}

	function renderLookupItem(item, index) {
		const state = getItemState(index);
		const descriptorHtml = item.descriptor
			? `<span class="lookup-item__descriptor"> - "${escapeHtml(item.descriptor)}"</span>`
			: '';

		const expandIcon = state.expanded ? '▲' : '▼';

		if (!item.meanings || item.meanings.length === 0) {
			const errorText = item.descriptor || 'No results';
			return `<article class="lookup-item" data-item-index="${index}">
				<header class="lookup-item__header">
					<h3 class="lookup-item__title">
						<span class="lookup-item__query">${escapeHtml(item.query)}</span>
					</h3>
				</header>
				<p class="lookup-item__error">${escapeHtml(errorText)}</p>
				<footer class="lookup-item__source">${escapeHtml(item.source)}</footer>
			</article>`;
		}

		const meaningCount = item.meanings.length;
		let bodyHtml;

		if (state.expanded) {
			bodyHtml = item.meanings.map((meaning, i) =>
				renderMeaningBlock(meaning, i, meaningCount, state, false)
			).join('');
		} else {
			const meaningIndex = Math.min(state.meaningIndex, meaningCount - 1);
			const meaning = item.meanings[meaningIndex];
			const defCount = meaning.definitions.length;
			if (state.definitionIndex >= defCount) {
				state.definitionIndex = 0;
			}
			bodyHtml = renderMeaningBlock(meaning, meaningIndex, meaningCount, state, true);
		}

		return `<article class="lookup-item" data-item-index="${index}">
			<header class="lookup-item__header">
				<h3 class="lookup-item__title">
					<span class="lookup-item__query">${escapeHtml(item.query)}</span>${descriptorHtml}
				</h3>
				<button class="lookup-item__expand" type="button" data-action="toggle-expand" aria-expanded="${state.expanded}" title="Expand">${expandIcon}</button>
			</header>
			<div class="lookup-item__body">${bodyHtml}</div>
			<footer class="lookup-item__source">${escapeHtml(item.source)}</footer>
		</article>`;
	}

	function renderTopBar(data) {
		const prevDisabled = data.page === 0 ? ' disabled' : '';
		const nextDisabled = data.page >= data.totalPages - 1 ? ' disabled' : '';

		const sizeChoices = PAGE_SIZE_OPTIONS.includes(data.pageSize)
			? PAGE_SIZE_OPTIONS
			: [...PAGE_SIZE_OPTIONS, data.pageSize].sort((a, b) => a - b);
		const sizeOptions = sizeChoices.map(size => {
			const selected = size === data.pageSize ? ' selected' : '';
			return `<option value="${size}"${selected}>${size}</option>`;
		}).join('');

		const pageInfo = data.totalItems > 0
			? `Page ${data.page + 1} / ${data.totalPages}`
			: 'No history';

		return `<div class="lookup-topbar">
			<div class="lookup-topbar__nav">
				<button class="lookup-topbar__btn" type="button" data-action="prev-page"${prevDisabled} title="Previous page">←</button>
				<button class="lookup-topbar__btn" type="button" data-action="next-page"${nextDisabled} title="Next page">→</button>
				<span class="lookup-topbar__page-info">${pageInfo}</span>
			</div>
			<div class="lookup-topbar__page-size">
				<label>show
					<select class="lookup-topbar__select" data-action="page-size">${sizeOptions}</select>
					per page
				</label>
			</div>
			<button class="lookup-topbar__delete" type="button" data-action="clear-history" title="Clear history">delete</button>
		</div>`;
	}

	function renderPanel(data) {
		panelData = data;
		itemState.clear();

		const itemsHtml = data.items.length > 0
			? data.items.map((item, i) => renderLookupItem(item, i)).join('')
			: '<p class="lookup-empty">No lookup history yet.</p>';

		root.innerHTML = `<div class="lookup-panel">
			${renderTopBar(data)}
			<div class="lookup-list">${itemsHtml}</div>
		</div>`;
	}

	function rerenderItem(index) {
		if (!panelData || !panelData.items[index]) return;
		const itemEl = root.querySelector(`[data-item-index="${index}"]`);
		if (!itemEl) return;

		const temp = document.createElement('div');
		temp.innerHTML = renderLookupItem(panelData.items[index], index);
		itemEl.replaceWith(temp.firstElementChild);
	}

	function handleItemAction(itemIndex, action) {
		const item = panelData?.items[itemIndex];
		if (!item || !item.meanings || item.meanings.length === 0) return;

		const state = getItemState(itemIndex);

		switch (action) {
		case 'toggle-expand':
			state.expanded = !state.expanded;
			break;
		case 'cycle-meaning': {
			const meaningCount = item.meanings.length;
			state.meaningIndex = (state.meaningIndex + 1) % meaningCount;
			state.definitionIndex = 0;
			break;
		}
		case 'cycle-definition': {
			const meaning = item.meanings[state.meaningIndex];
			if (meaning && meaning.definitions.length > 0) {
				state.definitionIndex = (state.definitionIndex + 1) % meaning.definitions.length;
			}
			break;
		}
		default:
			return;
		}

		rerenderItem(itemIndex);
	}

	root.addEventListener('click', (e) => {
		const target = e.target;

		if (target.matches('[data-action="prev-page"]') && !target.disabled) {
			webviewApi.postMessage({ type: 'setPage', page: panelData.page - 1 });
			return;
		}
		if (target.matches('[data-action="next-page"]') && !target.disabled) {
			webviewApi.postMessage({ type: 'setPage', page: panelData.page + 1 });
			return;
		}
		if (target.matches('[data-action="clear-history"]')) {
			webviewApi.postMessage({ type: 'clearHistory' });
			return;
		}

		const actionEl = target.closest('[data-action]');
		if (!actionEl) return;

		const itemEl = actionEl.closest('[data-item-index]');
		if (!itemEl) return;

		const itemIndex = parseInt(itemEl.dataset.itemIndex, 10);
		handleItemAction(itemIndex, actionEl.dataset.action);
	});

	root.addEventListener('change', (e) => {
		const target = e.target;
		if (target.matches('[data-action="page-size"]')) {
			const pageSize = parseInt(target.value, 10);
			webviewApi.postMessage({ type: 'setPageSize', pageSize });
		}
	});

	webviewApi.onMessage((message) => {
		if (message.type === 'update') {
			renderPanel(message);
		}
	});
})();
