import {load} from "cheerio";
import { LookupMeaning } from "./model";

function normalizeText(value: string): string {
    return value.replace(/\s+/g, " ").trim();
}

export function parseEtymOnlineHtml(query: string, html: string): LookupMeaning[] {

    const $ = load(html);
    const normalizedQuery = normalizeText(query).toLowerCase();
    const meanings: LookupMeaning[] = [];

    $("section.prose-lg").each((_, entry) => {
        const heading = $(entry).children("div").children("h2");
        const queryText = normalizeText(heading.find("span.hyphens-auto").first().text());

        if (queryText.toLowerCase() !== normalizedQuery) return;

        const partOfSpeech = normalizeText(
            heading.children("span.font-serif").not(".hyphens-auto").first().text(),
        ) || undefined;
        const definitions = $(entry)
            .children("section")
            .find("p")
            .map((_, paragraph) => {
                if ($(paragraph).text().includes("Want to removes ads?")) {return null;};
                return {
                    definition: normalizeText($(paragraph).text()),
                };
            })
            .get();

        meanings.push({ partOfSpeech, definitions });
    });

    return meanings;
}