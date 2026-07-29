# Lookup plugin for Joplin

![downloads](https://img.shields.io/badge/dynamic/json?color=brightgreen&label=downloads&query=%24.totalDownloads&url=https%3A%2F%2Fjoplin-plugin-downloads.vercel.app%2Fapi%3Fplugin%3Djoplin.plugin.lookup)

Look up definitions for words directly from Joplin. 

## Currently Supported:
 - Dictionary API (https://dictionaryapi.dev/)
 - Wikimedia REST API (https://www.mediawiki.org/wiki/Wikimedia_REST_API)

## Usage

- Install the plugin from the Joplin plugin repository (search "Lookup").
- Right click a highlighted word to perform a lookup query.
- For results with multiple meanings, left click to toggle display selection forward, and right click to toggle selection backwards.
- Click the 'expand' arrow to display all meanings at once.
- Toggle the panel with Ctrl+4 shortcut, or with the lookup icon in the Joplin context bar.
- Specify which API endpoint to query by default in the Joplin settings page of the plugin.
- Wikipedia API definitions include a link to the wiki page.