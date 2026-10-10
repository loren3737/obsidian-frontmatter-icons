const { Notice, Plugin, PluginSettingTab, Setting } = require("obsidian");

const EXPLORER_SELECTORS = {
    treeItem: ".tree-item-self[data-path]",
    folderTitle: ".nav-folder-title",
    fileTitle: ".nav-file-title",
    badge: ":scope > .folder-icon-property",
    allBadges: ".folder-icon-property",
    nativeIcon: ":scope > .tree-item-icon",
};

const MAX_EMOJIS = 3;
const graphemeSegmenter = typeof Intl.Segmenter === "function"
    ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
    : null;
const emojiComponentPattern = /^[\p{Extended_Pictographic}\p{Regional_Indicator}\p{Emoji_Modifier}#*0-9\uFE0E\uFE0F\u200D\u20E3\u{E0020}-\u{E007F}]+$/u;
const emojiPresentationPattern = /\p{Emoji_Presentation}/u;
const emojiVariationPattern = /\p{Extended_Pictographic}\uFE0F/u;
const regionalIndicatorPattern = /^\p{Regional_Indicator}+$/u;
const flagPattern = /^\p{Regional_Indicator}{2}$/u;
const keycapPattern = /^[#*0-9]\uFE0F?\u20E3$/u;

function getVisibleCharacters(value) {
    return graphemeSegmenter
        ? Array.from(graphemeSegmenter.segment(value), item => item.segment)
        : Array.from(value);
}

function isEmoji(value) {
    if (!emojiComponentPattern.test(value)) return false;
    if (regionalIndicatorPattern.test(value)) return flagPattern.test(value);
    return emojiPresentationPattern.test(value)
        || emojiVariationPattern.test(value)
        || keycapPattern.test(value);
}

function validateIconValue(value) {
    const emojis = getVisibleCharacters(value).filter(character => character.trim());
    if (emojis.length < 1 || emojis.length > MAX_EMOJIS || !emojis.every(isEmoji)) {
        return { valid: false, icon: "" };
    }
    return { valid: true, icon: emojis.join("") };
}

function normalizeFolderPath(value) {
    return value.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

const DEFAULT_SETTINGS = {
    folderIconOrder: "alphabetical",
    fileIconProperty: "file_icon",
    folderIconProperty: "folder_icon",
    showConflictMarker: true,
    globalFolderIcons: [],
};

module.exports = class FolderIconPropertyPlugin extends Plugin {
    async onload() {
        if (this.app.plugins.plugins["iconic"]) {
            new Notice("Disable Iconic before using Frontmatter Icons.");
            return;
        }

        this.settings = { ...DEFAULT_SETTINGS, ...((await this.loadData()) || {}) };
        if (!['alphabetical', 'reverse-alphabetical'].includes(this.settings.folderIconOrder)) {
            this.settings.folderIconOrder = DEFAULT_SETTINGS.folderIconOrder;
        }
        for (const property of ["fileIconProperty", "folderIconProperty"]) {
            if (typeof this.settings[property] !== "string") {
                this.settings[property] = DEFAULT_SETTINGS[property];
            }
            this.settings[property] = this.settings[property].trim();
        }
        if (typeof this.settings.showConflictMarker !== "boolean") {
            this.settings.showConflictMarker = DEFAULT_SETTINGS.showConflictMarker;
        }
        if (Array.isArray(this.settings.globalFolderIcons)) {
            this.settings.globalFolderIcons = this.settings.globalFolderIcons
                .filter(entry => entry && typeof entry === "object")
                .map(entry => ({
                    path: typeof entry.path === "string" ? entry.path : "",
                    icon: typeof entry.icon === "string" ? entry.icon : "",
                }));
        } else if (this.settings.globalFolderIcons && typeof this.settings.globalFolderIcons === "object") {
            this.settings.globalFolderIcons = Object.entries(this.settings.globalFolderIcons)
                .map(([path, icon]) => ({ path, icon: typeof icon === "string" ? icon : "" }));
        } else {
            this.settings.globalFolderIcons = [];
        }

        this.addSettingTab(new IconPropertySettingTab(this.app, this));
        this.folderIcons = new Map();
        this.fileIcons = new Map();
        this.scheduleIndex(0);

        this.registerEvent(this.app.metadataCache.on("changed", () => this.scheduleIndex()));
        this.registerEvent(this.app.metadataCache.on("resolved", () => this.scheduleIndex(0)));
        this.registerEvent(this.app.vault.on("create", () => this.scheduleIndex()));
        this.registerEvent(this.app.vault.on("rename", () => this.scheduleIndex()));
        this.registerEvent(this.app.vault.on("delete", () => this.scheduleIndex()));
        this.registerEvent(this.app.workspace.on("layout-change", () => {
            this.observeFileExplorers();
            this.scheduleRender();
        }));

        this.app.workspace.onLayoutReady(() => {
            this.observer = new MutationObserver(() => this.scheduleRender());
            this.observeFileExplorers();
            this.register(() => this.observer.disconnect());
            this.register(() => this.getFileExplorerContainers()
                .forEach(container => container.querySelectorAll(EXPLORER_SELECTORS.allBadges).forEach(icon => icon.remove())));
            this.scheduleRender(0);
        });
    }

    // Public API for scripts (e.g. dataviewjs) via
    // app.plugins.plugins["frontmatter-icons"].getIcon(path)
    getFileIcon(path) {
        const entry = this.fileIcons.get(path);
        if (!entry?.icon) return "";
        const validation = validateIconValue(entry.icon);
        return validation.valid ? validation.icon : "";
    }

    getFolderIcon(path) {
        const entry = this.folderIcons.get(normalizeFolderPath(path || ""));
        if (!entry?.icon) return "";
        const validation = validateIconValue(entry.icon);
        return validation.valid ? validation.icon : "";
    }

    // Icon for a file, falling back to the nearest ancestor folder's icon.
    getIcon(path) {
        const fileIcon = this.getFileIcon(path);
        if (fileIcon) return fileIcon;

        let folder = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
        while (folder) {
            const folderIcon = this.getFolderIcon(folder);
            if (folderIcon) return folderIcon;
            const lastSlash = folder.lastIndexOf("/");
            folder = lastSlash !== -1 ? folder.slice(0, lastSlash) : "";
        }
        return "";
    }

    getFileExplorerContainers() {
        return this.app.workspace.getLeavesOfType("file-explorer")
            .map(leaf => leaf.view.containerEl)
            .filter(Boolean);
    }

    observeFileExplorers() {
        if (!this.observer) return;

        this.observer.disconnect();
        for (const container of this.getFileExplorerContainers()) {
            this.observer.observe(container, { childList: true, subtree: true });
        }
    }

    scheduleIndex(delay = 250) {
        window.clearTimeout(this.indexTimer);
        this.indexTimer = window.setTimeout(() => this.rebuildIndex(), delay);
    }

    scheduleRender(delay = 50) {
        window.clearTimeout(this.renderTimer);
        this.renderTimer = window.setTimeout(() => this.renderExplorer(), delay);
    }

    readIconProperties(file) {
        const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
        const properties = {};
        if (!frontmatter) return properties;

        const propertyNames = {
            file_icon: this.settings.fileIconProperty,
            folder_icon: this.settings.folderIconProperty,
        };
        for (const [property, propertyName] of Object.entries(propertyNames)) {
            if (!propertyName) continue;
            const raw = frontmatter[propertyName];
            if (raw === undefined || raw === null) continue;
            // Non-string values (e.g. the property was switched to Checkbox/Number/List
            // in the Properties UI) can never be a valid emoji icon. Use a sentinel that
            // always fails validation so it still surfaces as an invalid-icon "?" badge
            // instead of silently showing nothing.
            const icon = typeof raw === "string" ? raw.trim() : " ";
            if (icon) properties[property] = { icon, wrongType: typeof raw !== "string" };
        }
        return properties;
    }

    rebuildIndex() {
        const folderCandidates = new Map();
        const fileIcons = new Map();

        for (const file of this.app.vault.getMarkdownFiles()) {
            const properties = this.readIconProperties(file);
            const fileProperty = properties.file_icon;
            if (fileProperty?.icon) {
                fileIcons.set(file.path, {
                    ...fileProperty,
                    conflict: false,
                    kind: "file",
                    source: file.path,
                });
            }

            const folderProperty = properties.folder_icon;
            if (file.parent && folderProperty?.icon) {
                const candidates = folderCandidates.get(file.parent.path) || [];
                candidates.push({ ...folderProperty, source: file.path });
                folderCandidates.set(file.parent.path, candidates);
            }
        }

        const comparePaths = (left, right) => {
            const a = left.toLowerCase();
            const b = right.toLowerCase();
            return a < b ? -1 : a > b ? 1 : left < right ? -1 : left > right ? 1 : 0;
        };
        const folderIcons = new Map();
        for (const [path, candidates] of folderCandidates) {
            const direction = this.settings.folderIconOrder === "reverse-alphabetical" ? -1 : 1;
            candidates.sort((a, b) => direction * comparePaths(a.source, b.source));
            const selected = candidates[0];
            folderIcons.set(path, {
                icon: selected.icon,
                conflict: candidates.length > 1,
                kind: "folder",
                source: selected.source,
                candidateCount: candidates.length,
                wrongType: selected.wrongType,
            });
        }

        for (const entry of this.settings.globalFolderIcons) {
            const path = normalizeFolderPath(entry.path || "");
            const icon = (entry.icon || "").trim();
            if (!path || !icon) continue;
            folderIcons.set(path, {
                icon,
                conflict: false,
                kind: "folder",
                global: true,
                path,
                source: "global settings",
            });
        }

        this.folderIcons = folderIcons;
        this.fileIcons = fileIcons;
        this.scheduleRender(0);
    }

    updateTreeItem(treeItem, property) {
        let badge = treeItem.querySelector(EXPLORER_SELECTORS.badge);
        if (!property?.icon) {
            badge?.remove();
            return;
        }

        const validation = validateIconValue(property.icon);
        const invalidIcon = !validation.valid;
        const displayIcon = invalidIcon ? "?" : validation.icon;
        const showConflictMarker = property.conflict && this.settings.showConflictMarker;
        const propertyName = property.kind === "folder"
            ? this.settings.folderIconProperty
            : this.settings.fileIconProperty;
        const tooltip = [
            invalidIcon
                ? property.global
                    ? `Invalid global folder icon for ${property.path}; use 1-3 emoji`
                    : property.wrongType
                        ? `"${propertyName}" must be a Text property containing 1-3 emoji (it's currently set to a different property type)`
                        : `Invalid ${propertyName} value; use 1-3 emoji`
                : "",
            showConflictMarker
                ? `${propertyName} conflict ${property.kind === "folder" ? "in this folder" : "on this file"}`
                : "",
        ].filter(Boolean).join("; ");
        if (badge?.dataset.icon === property.icon
            && badge.dataset.invalidIcon === String(invalidIcon)
            && badge.dataset.conflict === String(property.conflict)
            && badge.dataset.showConflictMarker === String(this.settings.showConflictMarker)
            && (tooltip ? badge.title === tooltip : !badge.hasAttribute("title"))) return;

        if (!badge) {
            badge = document.createElement("span");
            badge.className = "folder-icon-property";
            const nativeIcon = treeItem.querySelector(EXPLORER_SELECTORS.nativeIcon);
            if (nativeIcon) nativeIcon.insertAdjacentElement("afterend", badge);
            else treeItem.prepend(badge);
        }

        badge.replaceChildren();
        badge.dataset.icon = property.icon;
        badge.dataset.invalidIcon = String(invalidIcon);
        badge.dataset.conflict = String(property.conflict);
        badge.dataset.showConflictMarker = String(this.settings.showConflictMarker);
        badge.classList.toggle("folder-icon-property-invalid", invalidIcon);
        if (tooltip) badge.title = tooltip;
        else badge.removeAttribute("title");
        badge.removeAttribute("aria-label");
        badge.setAttribute("aria-hidden", "false");
        badge.createSpan({ cls: "folder-icon-property-glyph", text: displayIcon });
        if (invalidIcon || showConflictMarker) {
            badge.createSpan({ cls: "folder-icon-property-conflict", text: "!" });
        }
    }

    renderExplorer() {
        for (const container of this.getFileExplorerContainers()) {
            for (const treeItem of container.querySelectorAll(EXPLORER_SELECTORS.treeItem)) {
                const path = treeItem.dataset.path;
                if (treeItem.matches(EXPLORER_SELECTORS.folderTitle)) {
                    this.updateTreeItem(treeItem, this.folderIcons.get(path));
                } else if (treeItem.matches(EXPLORER_SELECTORS.fileTitle)) {
                    this.updateTreeItem(treeItem, this.fileIcons.get(path));
                }
            }
        }
    }
};

class IconPropertySettingTab extends PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display() {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl("h2", { text: "Frontmatter Icons" });

        new Setting(containerEl)
            .setName("Folder icon search order")
            .setDesc("Choose which note supplies the folder icon when multiple notes define one.")
            .addDropdown(dropdown => dropdown
                .addOption("alphabetical", "Alphabetical (A to Z)")
                .addOption("reverse-alphabetical", "Reverse alphabetical (Z to A)")
                .setValue(this.plugin.settings.folderIconOrder)
                .onChange(async value => {
                    this.plugin.settings.folderIconOrder = value;
                    await this.plugin.saveData(this.plugin.settings);
                    this.plugin.scheduleIndex(0);
                }));

        new Setting(containerEl)
            .setName("File icon property")
            .setDesc("Frontmatter property used to set a file icon.")
            .addText(text => text
                .setPlaceholder("file_icon")
                .setValue(this.plugin.settings.fileIconProperty)
                .onChange(async value => {
                    this.plugin.settings.fileIconProperty = value.trim();
                    await this.plugin.saveData(this.plugin.settings);
                    this.plugin.scheduleIndex(0);
                }));

        new Setting(containerEl)
            .setName("Folder icon property")
            .setDesc("Frontmatter property used to set a folder icon.")
            .addText(text => text
                .setPlaceholder("folder_icon")
                .setValue(this.plugin.settings.folderIconProperty)
                .onChange(async value => {
                    this.plugin.settings.folderIconProperty = value.trim();
                    await this.plugin.saveData(this.plugin.settings);
                    this.plugin.scheduleIndex(0);
                }));

        new Setting(containerEl)
            .setName("Global folder icons")
            .setDesc("Set icons by vault-relative folder path. These override folder_icon properties for the same folder and do not require a Markdown note.");

        this.plugin.settings.globalFolderIcons.forEach((entry, index) => {
            new Setting(containerEl)
                .setName(`Global folder icon ${index + 1}`)
                .addText(text => text
                    .setPlaceholder("00 Inbox")
                    .setValue(entry.path)
                    .onChange(async value => {
                        entry.path = value;
                        await this.plugin.saveData(this.plugin.settings);
                        this.plugin.scheduleIndex(0);
                    }))
                .addText(text => text
                    .setPlaceholder("📥")
                    .setValue(entry.icon)
                    .onChange(async value => {
                        entry.icon = value;
                        await this.plugin.saveData(this.plugin.settings);
                        this.plugin.scheduleIndex(0);
                    }))
                .addButton(button => button
                    .setButtonText("Remove")
                    .onClick(async () => {
                        this.plugin.settings.globalFolderIcons.splice(index, 1);
                        await this.plugin.saveData(this.plugin.settings);
                        this.display();
                    }));
        });

        new Setting(containerEl)
            .addButton(button => button
                .setButtonText("Add global folder icon")
                .setCta()
                .onClick(async () => {
                    this.plugin.settings.globalFolderIcons.push({ path: "", icon: "" });
                    await this.plugin.saveData(this.plugin.settings);
                    this.display();
                }));

        new Setting(containerEl)
            .setName("Show conflict marker")
            .setDesc("Show an exclamation mark and conflict tooltip when multiple icons are declared.")
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.showConflictMarker)
                .onChange(async value => {
                    this.plugin.settings.showConflictMarker = value;
                    await this.plugin.saveData(this.plugin.settings);
                    this.plugin.scheduleRender(0);
                }));
    }
}