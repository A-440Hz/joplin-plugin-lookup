import joplin from 'api';
import { appendToHistory, lookupAPIMap, model, performPrimaryLookup } from './model';
import { createLookupPanel, refreshLookupPanel, reloadHistoryFromSettings, showLookupPanel } from './panel';
import { MenuItemLocation, SettingItemType, SettingStorage, ToolbarButtonLocation } from 'api/types';

joplin.plugins.register({
	onStart: async function() {
		// eslint-disable-next-line no-console
		console.info('Lookup plugin started');

		await joplin.settings.registerSection(model.SECTION, {
			label: 'Lookup',
			iconName: 'fas fa-search',
		}).then(() => {
			console.info('Registered settings section: ', model.SECTION);
		});

		// register lookup history
		await joplin.settings.registerSettings({
			[model.lookupHistory]: {
				value: [],
				type: SettingItemType.Array,
				section: model.SECTION,
				public: false,
				label: "History of lookup queries",
				storage: SettingStorage.Database,
			}
		});

		await joplin.settings.registerSettings({
			[model.resultsPerPage]: {
				value: 8,
				type: SettingItemType.Int,
				section: model.SECTION,
				public: true,
				minimum: 1,
				step: 1,
				label: "Number of results to show per page in the lookup panel",
				storage: SettingStorage.Database,
			}
		}).then(() => {
			console.info('Lookup: Registered resultsPerPage setting: ', joplin.settings.value(model.resultsPerPage));
		})

		await joplin.commands.register({
			name: 'showLookupHistory',
			label: 'Show Lookup History',
			iconName: 'fas fa-history',
			execute: async () => {
				console.log(await joplin.settings.value(model.lookupHistory))
				// await reloadHistoryFromSettings();
				// await showLookupPanel();
			}
		})

		await joplin.views.toolbarButtons.create('showLookupHistory', 'showLookupHistory', ToolbarButtonLocation.NoteToolbar);


		await joplin.commands.register({
			name: 'lookup',
			label: 'lookup',
			execute: async () => {
				console.log("lookup command executed");
				const selectedText = (await joplin.commands.execute('selectedText') as string);
				console.log("selectedText: ", selectedText);
				const res = await performPrimaryLookup(selectedText);
				console.log("performPrimaryLookup result: ", res);
				await appendToHistory(res);
				await reloadHistoryFromSettings();
				await showLookupPanel();
			}
		});

		const apiChoices: Record<string, string> = Object.keys(lookupAPIMap).reduce((acc, key) => {
			acc[key] = key;
			return acc;
		}, {} as Record<string, string>);
		
		await joplin.settings.registerSettings({
		[model.currentAPIChoice]: {
			value: model.dictionaryAPI,
			type: SettingItemType.String,
			section: model.SECTION,
			public: true,
			isEnum: true,
			options: apiChoices,
			label: "Current API to use for lookups",
			storage: SettingStorage.Database,
		},
		});

		const primaryAPI = await joplin.settings.value(model.currentAPIChoice);
		const defaultFallback = Object.keys(lookupAPIMap).find(key => key !== primaryAPI);

		await joplin.settings.registerSettings({
		[model.fallbackAPIChoice]: {
			value: defaultFallback,
			type: SettingItemType.String,
			section: model.SECTION,
			public: true,
			isEnum: true,
			options: apiChoices,
			advanced: true,
			label: "Fallback API to use for lookups",
			description: 'defaults to first non-primary API option',
			storage: SettingStorage.Database,
		},
		});

		await joplin.settings.registerSettings({
		[model.showToolbarIcon]: {
			value: true,
			type: SettingItemType.Bool,
			section: model.SECTION,
			public: true,
			label: "Show the 'toggle lootbox panel' button in the toolbar",
			description: '(applies on restart)',
			storage: SettingStorage.Database,
		},
		}).then(() => {
			console.info('Lookup: Registered showToolbarIcon setting: ', joplin.settings.value(model.showToolbarIcon));
		})

		await joplin.settings.registerSettings({
        [model.panelAlwaysStartsClosed]: {
            value: false,
            type: SettingItemType.Bool,
            section: model.SECTION,
            public: true,
            label: "Always hide lookup panel when joplin opens",
            description: '(applies on restart)',
            storage: SettingStorage.Database,
        },
		}).then(() => {
			console.info('Lookup: Registered panelAlwaysStartsClosed setting: ', joplin.settings.value(model.panelAlwaysStartsClosed));
		})

		// re-draw the lookup panel when the resultsPerPage setting changes
		await joplin.settings.onChange(async (event: any) => {
			if (event.keys.includes(model.resultsPerPage)) {
				await reloadHistoryFromSettings();
			}
		});

		// create lookup panel
		const lookupPanel = await createLookupPanel();
		if (await joplin.settings.value(model.panelAlwaysStartsClosed) == true) {
			await joplin.views.panels.hide(lookupPanel)
		}

		// create toolbar icon to open panel
		await joplin.commands.register({
			name: 'toggleLookupPanel',
			label: 'Toggle Lookup Panel',
			iconName: 'fas fa-search',
			execute: async () => {
				const isOpen = (await joplin.views.panels.visible(lookupPanel)).valueOf();
				await reloadHistoryFromSettings()
				await joplin.views.panels.show(lookupPanel, !isOpen);				
			},
		});
		if (await joplin.settings.value(model.showToolbarIcon) === true) {
			await joplin.views.toolbarButtons.create('toggleLookupPanelButton', 'toggleLookupPanel', ToolbarButtonLocation.NoteToolbar);
		}
		
		await joplin.views.menuItems.create(
			'lookup.contextMenu',
			'lookup',
			MenuItemLocation.EditorContextMenu,
			{ accelerator: 'CmdOrCtrl+Shift+L' },
		);
	},
});
