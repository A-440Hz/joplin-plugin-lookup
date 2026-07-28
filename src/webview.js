/* global webviewApi */

(function() {
	console.log('webview script loaded');
	var pageSizeOptions = [3, 4, 5, 6, 8, 10, 12, 20];
	var itemState = new Map(); // key: item index, value: { meaningIndex, definitionIndex, expanded }

	var root = document.getElementById('lookup-root');

	webviewApi.postMessage({ message: 'ready' }).then(function(response) {
		console.log('Received response from ready:', response);
		bindPanelActions();
	})
	.catch(function(err) {
		console.error('Error sending ready message:', err);
	});

	webviewApi.onMessage(function(event) {
		console.log('webview received message:', event);
		message = event && event.message !== undefined ? event.message : event;
		if (message.type === 'update') {
			renderPanel(message);
		} else {
			console.warn('webview received unknown message type:', message.type);
		}
	})

	function bindPanelActions() {
		if (!root) return;

		root.addEventListener('click', function(e) {
			var target = e.target;
			var el = (target instanceof Element) ? target : (target && target.parentElement) ? target.parentElement : null;
			if (!el) {
				console.log('click event with non-element target', target);
				return;
			}

			var actionButton = el.closest('[data-action]');
			if (!actionButton) return;

			var action = actionButton.getAttribute('data-action');
			console.log('click action detected:', action);

			switch (action) {
			case 'prev-page':
				if (!panelData || panelData.page <= 0) return;
				webviewApi.postMessage({ message: 'setPage', page: panelData.page - 1 });
				return;
			case 'next-page':
				if (!panelData || panelData.page >= panelData.totalPages - 1) return;
				webviewApi.postMessage({ message: 'setPage', page: panelData.page + 1 });
				return;
			case 'clear-history':
				webviewApi.postMessage({ message: 'clearHistory' });
				return;
			case 'toggle-expand':
			case 'cycle-meaning':
			case 'cycle-definition':
				var itemEl = actionButton.closest('[data-item-index]');
				if (!itemEl) return;
				var itemIndex = parseInt(itemEl.dataset.itemIndex, 10);
				handleItemAction(itemIndex, action, 1);
				return;
			}
		});

		root.addEventListener('change', function(e) {
			var target = e.target;
			if (!(target instanceof Element)) return;
			if (target.matches('[data-action="page-size"]')) {
				var pageSize = parseInt(target.value, 10);
				webviewApi.postMessage({ message: 'setPageSize', pageSize: pageSize });
			}
		});

		root.addEventListener('contextmenu', function(e) {
			var target = e.target;
			var el = (target instanceof Element) ? target : (target && target.parentElement) ? target.parentElement : null;
			if (!el) {
				console.log('right click event with non-element target', target);
				return;
			}

			var actionButton = el.closest('[data-action]');
			if (!actionButton) return;
			var action = actionButton.getAttribute('data-action');
			console.log('right click action detected:', action);

			switch (action) {
			case 'cycle-meaning':
			case 'cycle-definition':
				var itemEl = actionButton.closest('[data-item-index]');
				if (!itemEl) return;
				var itemIndex = parseInt(itemEl.dataset.itemIndex, 10);
				handleItemAction(itemIndex, action, -1);
				return;
			}

		});
	}

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
		var sourceText = escapeHtml(item.source || '');
		var sourceHtml = item.link ?
			'<a href="' + escapeHtml(item.link) + '" target="_blank" rel="noopener noreferrer">' + sourceText + '</a>'
			: sourceText;

		if (!item.meanings || item.meanings.length === 0) {
			var errorText = item.descriptor || 'No results';
			return '<article class="lookup-item" data-item-index="' + index + '">' +
				'<header class="lookup-item__header">' +
					'<h3 class="lookup-item__title">' +
						'<span class="lookup-item__query">' + escapeHtml(item.query) + '</span>' +
					'</h3>' +
				'</header>' +
				'<p class="lookup-item__error">' + escapeHtml(errorText) + '</p>' +
				'<footer class="lookup-item__source">' + sourceHtml + '</footer>' +
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
			'<footer class="lookup-item__source">' + sourceHtml + '</footer>' +
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
			'<button class="lookup-topbar__delete" type="button" data-action="clear-history" title="Clear history" aria-label="Clear history">clear history</button>' +
		'</div>';
	}

	// renderPanel returns a list of items within the currently selected window, along with the current page and total pages. It also updates the itemState map to clear any previous state.
	function renderPanel(data) {
		console.log('Webview received update message:', data);
		panelData = data;
		itemState.clear();

		var itemsHtml = Array.isArray(data.items) && data.items.length > 0
			? data.items.map(function(item, i) {
				return renderLookupItem(item, i);
			}).join('')
			: '<p class="lookup-empty">No lookup history yet.</p>';

		if (!root) {
			console.log('No root element found');
			return;
		}

		root.innerHTML = '<div class="lookup-panel">' + renderTopBar(data) + '<div class="lookup-list">' + itemsHtml + '</div></div>';
	}

	function rerenderItem(index) {
		if (!panelData || !panelData.items[index]) return;
		var itemEl = root.querySelector('[data-item-index="' + index + '"]');
		if (!itemEl) return;

		var temp = document.createElement('div');
		temp.innerHTML = renderLookupItem(panelData.items[index], index);
		itemEl.replaceWith(temp.firstElementChild);
	}

	function handleItemAction(itemIndex, action, incr) {
		var item = panelData && panelData.items[itemIndex];
		if (!item || !item.meanings || item.meanings.length === 0) return;

		var state = getItemState(itemIndex);

		switch (action) {
		case 'toggle-expand':
			state.expanded = !state.expanded;
			break;
		case 'cycle-meaning':
			var meaningCount = item.meanings.length;
			state.meaningIndex = (state.meaningIndex + incr) % meaningCount;
			if (state.meaningIndex < 0) {
				state.meaningIndex = meaningCount + incr;
			}
			state.definitionIndex = 0;
			break;
		case 'cycle-definition':
			var meaning = item.meanings[state.meaningIndex];
			if (meaning && meaning.definitions.length > 0) {
				state.definitionIndex = (state.definitionIndex + incr) % meaning.definitions.length;
			}
			if (state.definitionIndex < 0) {
				state.definitionIndex = meaning.definitions.length + incr;
			}
			break;
		default:
			return;
		}

		rerenderItem(itemIndex);
	}


})();
