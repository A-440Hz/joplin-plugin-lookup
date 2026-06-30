/* global webviewApi */

(function() {
	var pageSizeOptions = [4, 8, 12, 16, 20];
	var itemState = new Map();
	var panelData = null;
	var root = null;
	var api = typeof window !== 'undefined' && window.webviewApi ? window.webviewApi : (typeof webviewApi !== 'undefined' ? webviewApi : null);

	var elements = {
		root: null
	};

	function escapeHtml(text) {
		var div = document.createElement('div');
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
		var parts = [];
		parts.push('<p class="lookup-definition__text">' + escapeHtml(definition.definition) + '</p>');

		if (definition.example) {
			parts.push('<p class="lookup-definition__example"><em>' + escapeHtml(definition.example) + '</em></p>');
		}

		if (meaning.synonyms && meaning.synonyms.length > 0) {
			parts.push('<p class="lookup-synonyms"><span class="lookup-label">Synonyms:</span> ' + escapeHtml(meaning.synonyms.join(', ')) + '</p>');
		}

		if (meaning.antonyms && meaning.antonyms.length > 0) {
			parts.push('<p class="lookup-antonyms"><span class="lookup-label">Antonyms:</span> ' + escapeHtml(meaning.antonyms.join(', ')) + '</p>');
		}

		return parts.join('');
	}

	function renderDefinitionBlock(meaning, defIndex, defCount, showTitle) {
		var definition = meaning.definitions[defIndex];
		if (!definition) return '';

		var titleHtml = showTitle
			? '<button class="lookup-definition__title" type="button" data-action="cycle-definition">definition ' + defIndex + ' <span class="lookup-index">(' + (defIndex + 1) + '/' + defCount + ')</span></button>'
			: '<span class="lookup-definition__title-static">definition ' + defIndex + '</span>';

		return '<section class="lookup-definition">' + titleHtml + renderDefinitionContent(definition, meaning) + '</section>';
	}

	function renderMeaningBlock(meaning, meaningIndex, meaningCount, state, collapsed) {
		var defCount = meaning.definitions.length;
		var posHtml = meaning.partOfSpeech
			? '<span class="lookup-meaning__pos">' + escapeHtml(meaning.partOfSpeech) + '</span>'
			: '';

		var titleHtml = collapsed
			? '<button class="lookup-meaning__title" type="button" data-action="cycle-meaning">meaning ' + meaningIndex + ' <span class="lookup-index">(' + (meaningIndex + 1) + '/' + meaningCount + ')</span> ' + posHtml + '</button>'
			: '<span class="lookup-meaning__title-static">meaning ' + meaningIndex + ' ' + posHtml + '</span>';

		var definitionsHtml;
		if (collapsed) {
			definitionsHtml = renderDefinitionBlock(meaning, state.definitionIndex, defCount, true);
		} else {
			definitionsHtml = meaning.definitions.map(function(_, i) {
				return renderDefinitionBlock(meaning, i, defCount, false);
			}).join('');
		}

		return '<section class="lookup-meaning">' + titleHtml + definitionsHtml + '</section>';
	}

	function renderLookupItem(item, index) {
		var state = getItemState(index);
		var descriptorHtml = item.descriptor
			? '<span class="lookup-item__descriptor"> - "' + escapeHtml(item.descriptor) + '"</span>'
			: '';

		var expandIcon = state.expanded ? '▲' : '▼';

		if (!item.meanings || item.meanings.length === 0) {
			var errorText = item.descriptor || 'No results';
			return '<article class="lookup-item" data-item-index="' + index + '">' +
				'<header class="lookup-item__header">' +
					'<h3 class="lookup-item__title">' +
						'<span class="lookup-item__query">' + escapeHtml(item.query) + '</span>' +
					'</h3>' +
				'</header>' +
				'<p class="lookup-item__error">' + escapeHtml(errorText) + '</p>' +
				'<footer class="lookup-item__source">' + escapeHtml(item.source) + '</footer>' +
			'</article>';
		}

		var meaningCount = item.meanings.length;
		var bodyHtml;

		if (state.expanded) {
			bodyHtml = item.meanings.map(function(meaning, i) {
				return renderMeaningBlock(meaning, i, meaningCount, state, false);
			}).join('');
		} else {
			var meaningIndex = Math.min(state.meaningIndex, meaningCount - 1);
			var meaning = item.meanings[meaningIndex];
			var defCount = meaning.definitions.length;
			if (state.definitionIndex >= defCount) {
				state.definitionIndex = 0;
			}
			bodyHtml = renderMeaningBlock(meaning, meaningIndex, meaningCount, state, true);
		}

		return '<article class="lookup-item" data-item-index="' + index + '">' +
			'<header class="lookup-item__header">' +
				'<h3 class="lookup-item__title">' +
					'<span class="lookup-item__query">' + escapeHtml(item.query) + '</span>' + descriptorHtml +
				'</h3>' +
				'<button class="lookup-item__expand" type="button" data-action="toggle-expand" aria-expanded="' + state.expanded + '" title="Expand">' + expandIcon + '</button>' +
			'</header>' +
			'<div class="lookup-item__body">' + bodyHtml + '</div>' +
			'<footer class="lookup-item__source">' + escapeHtml(item.source) + '</footer>' +
		'</article>';
	}

	function renderTopBar(data) {
		var prevDisabled = data.page === 0 ? ' disabled' : '';
		var nextDisabled = data.page >= data.totalPages - 1 ? ' disabled' : '';

		var sizeChoices = pageSizeOptions.includes(data.pageSize)
			? pageSizeOptions
			: pageSizeOptions.concat(data.pageSize).sort(function(a, b) { return a - b; });
		var sizeOptions = sizeChoices.map(function(size) {
			var selected = size === data.pageSize ? ' selected' : '';
			return '<option value="' + size + '"' + selected + '>' + size + '</option>';
		}).join('');

		var pageInfo = data.totalItems > 0
			? 'Page ' + (data.page + 1) + ' / ' + data.totalPages
			: 'No history';

		return '<div class="lookup-topbar">' +
			'<div class="lookup-topbar__nav">' +
				'<button class="lookup-topbar__btn" type="button" data-action="prev-page"' + prevDisabled + ' title="Previous page">←</button>' +
				'<button class="lookup-topbar__btn" type="button" data-action="next-page"' + nextDisabled + ' title="Next page">→</button>' +
				'<span class="lookup-topbar__page-info">' + pageInfo + '</span>' +
			'</div>' +
			'<div class="lookup-topbar__page-size">' +
				'<label>show' +
					'<select class="lookup-topbar__select" data-action="page-size">' + sizeOptions + '</select>' +
					'per page' +
				'</label>' +
			'</div>' +
			'<button class="lookup-topbar__delete" type="button" data-action="clear-history" title="Clear history">delete</button>' +
		'</div>';
	}

	function renderPanel(data) {
		console.log('Webview received update message:', data);
		panelData = data;
		itemState.clear();

		var itemsHtml = data.items.length > 0
			? data.items.map(function(item, i) {
				return renderLookupItem(item, i);
			}).join('')
			: '<p class="lookup-empty">No lookup history yet.</p>';

		if (!elements.root) {
			console.log('No root element found');
			return;
		}

		elements.root.innerHTML = '<div class="lookup-panel">' + renderTopBar(data) + '<div class="lookup-list">' + itemsHtml + '</div></div>';
	}

	function rerenderItem(index) {
		if (!panelData || !panelData.items[index]) return;
		var itemEl = elements.root.querySelector('[data-item-index="' + index + '"]');
		if (!itemEl) return;

		var temp = document.createElement('div');
		temp.innerHTML = renderLookupItem(panelData.items[index], index);
		itemEl.replaceWith(temp.firstElementChild);
	}

	function handleItemAction(itemIndex, action) {
		var item = panelData && panelData.items[itemIndex];
		if (!item || !item.meanings || item.meanings.length === 0) return;

		var state = getItemState(itemIndex);

		switch (action) {
		case 'toggle-expand':
			state.expanded = !state.expanded;
			break;
		case 'cycle-meaning':
			var meaningCount = item.meanings.length;
			state.meaningIndex = (state.meaningIndex + 1) % meaningCount;
			state.definitionIndex = 0;
			break;
		case 'cycle-definition':
			var meaning = item.meanings[state.meaningIndex];
			if (meaning && meaning.definitions.length > 0) {
				state.definitionIndex = (state.definitionIndex + 1) % meaning.definitions.length;
			}
			break;
		default:
			return;
		}

		rerenderItem(itemIndex);
	}

	function getApi() {
		return typeof window !== 'undefined' && window.webviewApi
			? window.webviewApi
			: (typeof webviewApi !== 'undefined' ? webviewApi : null);
	}

	function init() {
		root = document.getElementById('lookup-root');
		elements.root = root;

		if (!root) {
			setTimeout(init, 100);
			return;
		}

		api = getApi();
		if (!api) {
			setTimeout(init, 100);
			return;
		}

		if (!elements.root.innerHTML.trim()) {
			elements.root.innerHTML = '<div class="lookup-panel"><p class="lookup-empty">Loading lookup history…</p></div>';
		}

		api.onMessage(function(message) {
			console.log('Webview received message:', message);
			if (message.type === 'update') {
				renderPanel(message);
			}
		});

		console.log('Webview initializing, sending ready message...');
		api.postMessage({ message: 'ready' })
			.then(function(response) {
				console.log('Received response from ready:', response);
			})
			.catch(function(err) {
				console.error('Error sending ready message:', err);
			});

		elements.root.addEventListener('click', function(e) {
			var target = e.target;
			if (!(target instanceof Element)) return;

			if (target.matches('[data-action="prev-page"]') && !target.disabled) {
				api.postMessage({ message: 'setPage', page: panelData.page - 1 });
				return;
			}
			if (target.matches('[data-action="next-page"]') && !target.disabled) {
				api.postMessage({ message: 'setPage', page: panelData.page + 1 });
				return;
			}
			if (target.matches('[data-action="clear-history"]')) {
				api.postMessage({ message: 'clearHistory' });
				return;
			}

			var actionEl = target.closest('[data-action]');
			if (!actionEl) return;

			var itemEl = actionEl.closest('[data-item-index]');
			if (!itemEl) return;

			var itemIndex = parseInt(itemEl.dataset.itemIndex, 10);
			handleItemAction(itemIndex, actionEl.dataset.action);
		});

		elements.root.addEventListener('change', function(e) {
			var target = e.target;
			if (!(target instanceof Element)) return;
			if (target.matches('[data-action="page-size"]')) {
				var pageSize = parseInt(target.value, 10);
				api.postMessage({ message: 'setPageSize', pageSize: pageSize });
			}
		});
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}
})();
