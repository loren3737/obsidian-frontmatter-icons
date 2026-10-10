# Frontmatter Icons

An Obsidian plugin that reads emoji values from Markdown frontmatter and displays them beside the corresponding file or folder in the File Explorer. Icons are stored with notes, so moving a note or folder does not leave a path-keyed icon behind.

## Properties

The default property names are `file_icon` and `folder_icon`; both can be changed in the plugin settings. Each value must contain 1 to 3 emoji. Spaces between emoji are allowed, but mixed text and values with more than 3 emoji are invalid:

```yaml
folder_icon: "🫐"
file_icon: "👟"
```

Invalid non-empty values display as `?` with an exclamation marker and a tooltip explaining the allowed format. The frontmatter is left unchanged so you can correct the value there.

`folder_icon` applies to the folder that directly contains that Markdown note. It can be set on any Markdown note in the folder; it does not need to be on `00 index.md`.

`file_icon` applies to the Markdown note containing the property. A note can set both properties: one icon for itself and one for its containing folder.

## Conflicts

If multiple notes in a folder declare `folder_icon`, the note selected by the configured folder icon search order supplies the folder icon. The default is the existing rule: the first path in case-insensitive alphabetical order. Duplicate declarations of the same property in one note also count as a conflict; the first declaration supplies the icon.

In the plugin settings, you can change the file and folder property names, configure global folder icons, select alphabetical or reverse-alphabetical folder icon order, and toggle conflict markers. Global entries use vault-relative paths and override `folder_icon` frontmatter for the same folder. Conflict markers are enabled by default. When enabled, their tooltip identifies a conflict in the folder or file; disabling this setting hides conflict markers and tooltips. Invalid-value warnings remain visible independently.

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