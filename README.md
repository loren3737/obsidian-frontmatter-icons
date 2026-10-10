# Frontmatter Icons

An Obsidian plugin that reads emoji values from Markdown frontmatter and displays them beside the corresponding file or folder in the File Explorer. Icons are stored with notes, so moving a note or folder does not leave a path-keyed icon behind.

## Properties

The default property names are `file_icon` and `folder_icon`. Each value must contain 1 to 3 emoji. Spaces between emoji are allowed, but mixed text and values with more than 3 emoji are invalid:

```yaml
folder_icon: "🫐"
file_icon: "👟"
```

Invalid non-empty values display as `?` with an exclamation marker and a tooltip explaining the allowed format. The frontmatter is left unchanged so you can correct the value there.

`folder_icon` applies to the folder that directly contains the Markdown note. Any Markdown note in that folder can declare it.

`file_icon` applies to the Markdown note containing the property. A note can set both properties: one icon for itself and one for its containing folder.

## Settings

Open **Frontmatter Icons** in Obsidian's plugin settings to configure:

- **File icon property**: Frontmatter property used for note icons. Defaults to `file_icon`.
- **Folder icon property**: Frontmatter property used for folder icons. Defaults to `folder_icon`.
- **Folder icon search order**: Choose alphabetical (A to Z) or reverse alphabetical (Z to A) when multiple notes in a folder declare `folder_icon`.
- **Global folder icons**: Set an icon for a vault-relative folder path. These override a `folder_icon` property and do not require a Markdown note. Add or remove entries in settings.
- **Show conflict marker**: Show or hide the exclamation mark and tooltip when multiple icons are declared. Invalid-value warnings remain visible when conflict markers are hidden.

## Conflicts

If multiple notes in a folder declare `folder_icon`, the configured search order determines which note supplies the folder icon. Duplicate declarations of the same property in one note also count as a conflict; the first declaration supplies the icon. Conflict markers are enabled by default.

## API and dashboards

Scripts can access the plugin through `app.plugins.plugins["frontmatter-icons"]`. The API accepts vault-relative paths:

- `getFileIcon(path)` returns the icon set on that note.
- `getFolderIcon(path)` returns the icon set on that folder.
- `getIcon(path)` returns the note icon, falling back to the nearest ancestor folder icon.

Each method returns an empty string when no valid icon is available. In a DataviewJS block, use `getIcon` to show icons in a dashboard table:

```dataviewjs
const icons = app.plugins.plugins["frontmatter-icons"];

dv.table(
	["Icon", "Project"],
	dv.pages('"Projects"')
		.map(page => [icons?.getIcon(page.file.path) ?? "", page.file.link])
);
```

## Install for testing

1. Copy this folder into `<vault>/.obsidian/plugins/frontmatter-icons/`.
2. Enable **Frontmatter Icons** in Obsidian's Community plugins settings.
3. Add `folder_icon` or `file_icon` to a Markdown note and inspect that folder or note in the File Explorer.

## Limitations

- Rendering observes active File Explorer views and uses Obsidian DOM selectors to find tree rows. Obsidian UI changes may require plugin updates; rendering is skipped when a File Explorer view is unavailable.
- The plugin scans Markdown files when vault metadata changes. Test performance on larger vaults.
- Property parsing supports simple, single-line scalar values; it is not a general YAML parser.
- Test desktop and mobile, different themes, note/folder moves, property removal, and conflicts before submitting to the Community Plugins list.
- For each release, verify the manifest and minimum app version, then publish a version-matched GitHub release containing `main.js`, `manifest.json`, and `styles.css`.