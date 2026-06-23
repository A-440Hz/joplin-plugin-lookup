import joplin from 'api';
import { ViewHandle } from 'api/types';

let lookupPanelHandle: ViewHandle;

export async function createLookupPanel() : Promise<ViewHandle> {
    lookupPanelHandle = await joplin.views.panels.create('lookupPanel');
    return lookupPanelHandle;
}