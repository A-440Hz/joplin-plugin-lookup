import joplin from 'api';
import { ViewHandle } from 'api/types';
import { LookupItem, model } from './model';

let lookupPanelHandle: ViewHandle;
export let inMemoryHistory: LookupItem[]; // see if I actually need the export

export async function createLookupPanel() : Promise<ViewHandle> {
    lookupPanelHandle = await joplin.views.panels.create('lookupPanel');
    const resultsPerPage = await joplin.settings.value(model.resultsPerPage)
    inMemoryHistory = await joplin.settings.value(model.lookupHistory) as LookupItem[] || [];
    inMemoryHistory = inMemoryHistory.slice(0, resultsPerPage); // limit to resultsPerPage
    return lookupPanelHandle;
}

// maintain an in-memory lookup history 