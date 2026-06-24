import joplin from "api";

export namespace model {
    export const SECTION = 'SectionPluginLookup';
    export const lookupHistory = 'PL_LookupHistory';
    export const resultsPerPage = "PL_ResultsPerPage";
    export const currentAPIChoice = "PL_CurrentAPIChoice";
    export const lookupHistoryKey = 'PL_LookupHistoryKey';

    // user preferences
    export const showToolbarIcon = 'PL_ShowToolbarIcon';
    export const panelAlwaysStartsClosed = 'PL_PanelAlwaysStartsClosed';


}

const DICTIONARY_API_BASE = 'https://api.dictionaryapi.dev/api/v2/entries/en/';

export interface LookupDefinition {
    definition: string;
    example?: string;
}

export interface LookupMeaning {
    partOfSpeech?: string;
    definitions: LookupDefinition[];
    synonyms?: string[];
    antonyms?: string[];
}

export interface LookupItem {
    // id: string;
    // timestamp: number;
    // endpoint: string; // this would specify the api used for the operation
    query: string;
    descriptor?: string;
    meanings: LookupMeaning[];
}

function createErrorLookup(query: string): LookupItem {
    return {
        query,
        descriptor: "Error: Unable to find results for this query",
        meanings: []
    };
}

type DictionaryAPIMeaning = {
    partOfSpeech?: string;
    definitions: LookupDefinition[];
    synonyms?: string[];
    antonyms?: string[];
};

async function performFallbackLookup(query: string): Promise<LookupItem> {
    // get the fallbackAPIChoice. it would be a map of keys to functions
    // see if i can make it non-duplicable as an enum choice
    return createErrorLookup(query);
}

export async function lookupFromDictionaryAPI(query: string): Promise<LookupItem> {
    const trimmedQuery = query?.trim();
    if (!trimmedQuery) {
        return createErrorLookup(query);
    }

    const url = `${DICTIONARY_API_BASE}${encodeURIComponent(trimmedQuery)}`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            return performFallbackLookup(query);
        }

        const data = await response.json();
        if (!Array.isArray(data) || data.length === 0) {
            return performFallbackLookup(query);
        }

        const entry = data[0];
        if (!entry || !Array.isArray(entry.meanings)) {
            return performFallbackLookup(query);
        }

        const meanings: LookupMeaning[] = entry.meanings.map((meaning: DictionaryAPIMeaning) => {
            const definitions: LookupDefinition[] = Array.isArray(meaning.definitions)
                ? meaning.definitions.map((def: { definition: string; example?: string; }) => ({
                    definition: def.definition,
                    example: def.example? def.example : undefined,
                }))
                : [];

            return {
                partOfSpeech: meaning.partOfSpeech,
                definitions,
                synonyms: meaning.synonyms? [meaning.synonyms] : undefined,
                antonyms: meaning.antonyms? [meaning.antonyms] : undefined,
            };
        }).filter((meaning: DictionaryAPIMeaning) => meaning.definitions.length > 0);
        if (meanings.length === 0) {
            return performFallbackLookup(query);
        }

        return {
            query: trimmedQuery,
            descriptor: entry.phonetic? entry.phonetic : undefined,
            meanings,
        };
    } catch (error) {
        return performFallbackLookup(query);
    }
}

export async function appendToHistory(newItem: LookupItem): Promise<void> {
    const history = await joplin.settings.value(model.lookupHistory) as LookupItem[] || [];
    history.unshift(newItem); // O(n) -- fine within 1000 queries
    await joplin.settings.setValue(model.lookupHistory, history);
}

export async function clearHistory(): Promise<void> {
    await joplin.settings.setValue(model.lookupHistory, []);
}