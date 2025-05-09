'use strict';

const { Adw, Gio, Gtk, GObject } = imports.gi;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

// Dictionary of available languages
const LANGUAGES = {
    'it': 'Italiano',
    'en': 'English',
    'es': 'Español',
    'fr': 'Français',
    'de': 'Deutsch',
    'pt': 'Português',
    'zh': '中文 (Chinese)',
    'ja': '日本語 (Japanese)',
    'ru': 'Русский (Russian)',
    'custom': 'Custom Language'
};

function init() {
}

function fillPreferencesWindow(window) {
    // Use the extension's settings
    const settings = ExtensionUtils.getSettings('org.gnome.shell.extensions.gtranslator');
    
    // Create a general preferences page
    const page = new Adw.PreferencesPage({
        title: 'Settings',
        icon_name: 'preferences-system-symbolic',
    });
    window.add(page);
    
    // API preferences group
    const apiGroup = new Adw.PreferencesGroup({
        title: 'API Settings',
        description: 'Google Gemini API Configuration',
    });
    page.add(apiGroup);
    
    // Add the API key field - using ActionRow with Entry as suffix
    // instead of EntryRow which might not be available
    const apiKeyRow = new Adw.ActionRow({
        title: 'Google Gemini API Key',
        subtitle: 'Enter your Google Gemini API key here'
    });
    
    // Create a simple text field
    const apiKeyEntry = new Gtk.Entry({
        text: settings.get_string('api-key') || '',
        valign: Gtk.Align.CENTER,
        hexpand: true
    });
    
    apiKeyEntry.connect('changed', (entry) => {
        settings.set_string('api-key', entry.get_text());
    });
    
    apiKeyRow.add_suffix(apiKeyEntry);
    apiKeyRow.set_activatable_widget(apiKeyEntry);
    apiGroup.add(apiKeyRow);
    
    // Details on how to get an API key
    const apiInfoRow = new Adw.ActionRow({
        title: 'How to get an API key',
        subtitle: 'Visit Google AI Studio, create a project, and generate an API key'
    });
    const apiLink = new Gtk.LinkButton({
        label: 'Google AI Studio',
        uri: 'https://makersuite.google.com/app/apikey',
        valign: Gtk.Align.CENTER
    });
    apiInfoRow.add_suffix(apiLink);
    apiGroup.add(apiInfoRow);
    
    // Translation preferences group
    const translationGroup = new Adw.PreferencesGroup({
        title: 'Translation Settings',
        description: 'Translation options configuration'
    });
    page.add(translationGroup);
    
    // Default language dropdown
    const languageRow = new Adw.ComboRow({
        title: 'Default Language',
        subtitle: 'Default target language for translations'
    });
    
    // Add languages to the dropdown
    const languageModel = new Gtk.StringList();
    const languageCodes = [];
    
    for (const [code, name] of Object.entries(LANGUAGES)) {
        languageModel.append(name);
        languageCodes.push(code);
    }
    
    languageRow.set_model(languageModel);
    
    // Set the default language
    const currentLanguage = settings.get_string('target-language') || 'en';
    const languageIndex = languageCodes.indexOf(currentLanguage);
    if (languageIndex !== -1) {
        languageRow.set_selected(languageIndex);
    }
    
    // Save the selected language
    languageRow.connect('notify::selected', (row) => {
        const selectedCode = languageCodes[row.get_selected()];
        settings.set_string('target-language', selectedCode);
    });
    
    translationGroup.add(languageRow);
    
    // Aggiungo il campo per la lingua personalizzata
    const customLangRow = new Adw.ActionRow({
        title: 'Custom Language',
        subtitle: 'Write a custom language name to use when "Custom Language" is selected'
    });
    
    // Create a text field for the custom language
    const customLangEntry = new Gtk.Entry({
        text: settings.get_string('custom-language') || 'hungarian',
        valign: Gtk.Align.CENTER,
        hexpand: true
    });
    
    customLangEntry.connect('changed', (entry) => {
        settings.set_string('custom-language', entry.get_text());
    });
    
    customLangRow.add_suffix(customLangEntry);
    customLangRow.set_activatable_widget(customLangEntry);
    translationGroup.add(customLangRow);
    
    // Option to enable/disable auto-copy - using ActionRow with Switch as suffix
    const autoCopyRow = new Adw.ActionRow({
        title: 'Auto-Copy to Clipboard',
        subtitle: 'Automatically copy translated text to clipboard'
    });
    
    // Create a switch
    const autoCopySwitch = new Gtk.Switch({
        active: settings.get_boolean('auto-copy'),
        valign: Gtk.Align.CENTER
    });
    
    autoCopySwitch.connect('notify::active', (widget) => {
        settings.set_boolean('auto-copy', widget.get_active());
    });
    
    autoCopyRow.add_suffix(autoCopySwitch);
    autoCopyRow.set_activatable_widget(autoCopySwitch);
    translationGroup.add(autoCopyRow);
}