import joplin from "api";

export namespace model {
    export const SECTION = 'SectionPluginLookup';
    export const lookupHistory = 'PL_LookupHistory';
    export const resultsPerPage = "PL_ResultsPerPage";
    export const currentAPIChoice = "PL_CurrentAPIChoice";
    export const fallbackAPIChoice = "PL_FallbackAPIChoice";

    // user preferences
    export const showToolbarIcon = 'PL_ShowToolbarIcon';
    export const panelAlwaysStartsClosed = 'PL_PanelAlwaysStartsClosed';

    // api options
    export const dictionaryAPI = 'dictionaryapi.dev';
    export const wikipediaAPI = 'wikipedia.org';
}

const defaultAPI = model.dictionaryAPI;

// Custom error types to inform lookup fallback behavior
class QueryError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'QueryError';
    }
}

class APIError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'APIError';
    }
}

const DICTIONARY_API_BASE = 'https://api.dictionaryapi.dev/api/v2/entries/en/';
const WIKIPEDIA_API_BASE = 'https://en.wikipedia.org/api/rest_v1/page/summary/';

export const lookupAPIMap: Record<string, (query: string) => Promise<LookupItem>> = {
    [model.dictionaryAPI]: lookupFromDictionaryAPI,
    [model.wikipediaAPI]: lookupFromWikipediaAPI,
};

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
    source: string;
}

function createErrorLookup(query: string, err: Error, source: string): LookupItem {
    return {
        query,
        descriptor: "Error: " + err.message,
        meanings: [],
        source: source,
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
    const apiChoice = (await joplin.settings.value(model.fallbackAPIChoice) as string) || defaultAPI;
    const apiFn = lookupAPIMap[apiChoice];
    try {
        return await apiFn(query);
    } catch (error) {
        if (error instanceof QueryError) {
            return createErrorLookup(query, error as QueryError, apiChoice);
        }
    }
    return createErrorLookup(query, new Error("Failed to fetch data"), apiChoice);
}

export async function performPrimaryLookup(query: string): Promise<LookupItem> {
    const apiChoice = (await joplin.settings.value(model.currentAPIChoice) as string) || defaultAPI;
    const apiFn = lookupAPIMap[apiChoice];

    try {
        return await apiFn(query);
    } catch (error) {
        // Return error immediately if query was bad
        if (error instanceof QueryError) {
            return createErrorLookup(query, error as QueryError, apiChoice);
        }
        // initiate fallback for API errors
        return performFallbackLookup(query);
    }
}

export async function lookupFromDictionaryAPI(query: string): Promise<LookupItem> {
    const trimmedQuery = query?.trim();
    if (!trimmedQuery) {
        throw new QueryError("Query cannot be empty or whitespace");
    }

    const url = `${DICTIONARY_API_BASE}${encodeURIComponent(trimmedQuery)}`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new APIError("Failed to fetch dictionary data");
        }

        const data = await response.json();
        if (!Array.isArray(data) || data.length === 0) {
            throw new APIError("No results found for this query");
        }

        const entry = data[0];
        if (!entry || !Array.isArray(entry.meanings)) {
            throw new APIError("Invalid API response format");
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
                synonyms: Array.isArray(meaning.synonyms) ? meaning.synonyms : undefined,
                antonyms: Array.isArray(meaning.antonyms) ? meaning.antonyms : undefined,
            };
        }).filter((meaning: DictionaryAPIMeaning) => meaning.definitions.length > 0);
        if (meanings.length === 0) {
            throw new APIError("No valid results found for this query");
        }

        return {
            query: trimmedQuery,
            descriptor: entry.phonetic? entry.phonetic : undefined,
            meanings,
            source: "Dictionary API",
        };
    } catch (error) {
        throw error;
    }
}

export async function lookupFromWikipediaAPI(query: string): Promise<LookupItem> {
    const trimmedQuery = query?.trim();
    if (!trimmedQuery) {
        throw new QueryError("Query cannot be empty or whitespace");
    }
    const url = `${WIKIPEDIA_API_BASE}${encodeURIComponent(trimmedQuery)}`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new APIError("Failed to fetch Wikipedia data");
        }

        const data = await response.json();
        if (!data || typeof data !== 'object') {
            throw new APIError("Invalid Wikipedia API response");
        }

        return {
            query: trimmedQuery,
            descriptor: data.description? data.description : undefined,
            meanings: [data.extract ? { definitions: [{ definition: data.extract }] } : { definitions: [] } ],
            source: "Wikipedia API",
        };
    } catch (error) {
        throw error;
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