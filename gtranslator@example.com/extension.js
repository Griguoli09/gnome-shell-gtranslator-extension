'use strict';

const { Clutter, Gio, GLib, GObject, St, Pango, GdkPixbuf } = imports.gi;
const ExtensionUtils = imports.misc.extensionUtils;
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;
const Soup = imports.gi.Soup;

const Me = ExtensionUtils.getCurrentExtension();
const GETTEXT_DOMAIN = Me.metadata.uuid;
const _ = ExtensionUtils.gettext;

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
    'ar': 'العربية (Arabic)'
};

// Main function of the extension
class GTranslatorExtension {
    constructor() {
        this._settings = ExtensionUtils.getSettings('org.gnome.shell.extensions.gtranslator');
        
        // Initialize the HTTP client (Soup)
        this._httpSession = new Soup.Session();
        this._httpSession.user_agent = 'GTranslator GNOME Shell Extension';
        
        this._indicator = null;
    }
    
    // Function called when the extension is enabled
    enable() {
        this._indicator = new GTranslatorIndicator(this._settings, this._httpSession);
        Main.panel.addToStatusArea('gtranslator', this._indicator);
    }
    
    // Function called when the extension is disabled
    disable() {
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
        
        // Close the HTTP session
        if (this._httpSession) {
            this._httpSession.abort();
            this._httpSession = null;
        }
    }
}

// Extends the PanelMenu.Button class to create the icon in the panel and manage the menu
var GTranslatorIndicator = GObject.registerClass(
class GTranslatorIndicator extends PanelMenu.Button {
    _init(settings, httpSession) {
        super._init(0.0, 'GTranslator');
        
        this._settings = settings;
        this._httpSession = httpSession;
        
        // Add a custom SVG icon to the panel
        let iconPath = Me.dir.get_child('icon.svg').get_path();
        let gicon = new Gio.FileIcon({ file: Gio.File.new_for_path(iconPath) });
        
        let icon = new St.Icon({
            gicon: gicon,
            icon_size: 16,
            style_class: 'system-status-icon'
        });
        this.add_child(icon);
        
        this._buildMenu();
        
        // Variable to keep track of loading state
        this._isLoading = false;
    }
    
    _buildMenu() {
        // Complete menu
        this._buildUIElements();
        this._connectSignals();
    }
    
    _buildUIElements() {
        // Container for input and output fields with spacing
        let mainContainer = new St.BoxLayout({
            vertical: true,
            style: 'spacing: 8px; padding: 12px; width: 400px;'
        });
        
        // Section for text to translate
        let inputSection = new St.BoxLayout({
            vertical: true,
            style: 'spacing: 4px; margin-bottom: 10px;'
        });
        
        // Source text - label
        let sourceLabel = new St.Label({
            text: _('Text to translate:'),
            style_class: 'gtranslator-label',
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true
        });
        inputSection.add_child(sourceLabel);
        
        // Creo uno ScrollView come suggerito
        let sourceScrollView = new St.ScrollView({
            overlay_scrollbars: true,
            hscrollbar_policy: St.PolicyType.NEVER,     // Mai mostrare scrollbar orizzontale
            vscrollbar_policy: St.PolicyType.AUTOMATIC, // Scrollbar verticale automatica
            enable_mouse_scrolling: true,
            x_expand: true,
            y_expand: true,
            style: 'min-height: 100px; max-height: 120px;'
        });
        
        // Create a box container for the text entry
        let sourceBox = new St.BoxLayout({ 
            style_class: 'gtranslator-entry',
            vertical: true,
            x_expand: true,
            y_expand: false, // Changed from true, so height is determined by content for scrolling
            style: 'min-height: 100px; padding: 8px;' // Kept min-height for the box itself
        });
        
        // Create the text entry
        this._sourceTextEntry = new St.Entry({
            hint_text: _('Enter text to translate'),
            track_hover: true,
            can_focus: true,
            reactive: true, // Added to ensure the entry can receive focus
            x_expand: true,
            // y_expand: true, // Removed to allow natural height based on content
            style: 'border: none; background: none;' // Removed min-height, height will be content-driven
        });
        // Explicitly grab focus on click
        this._sourceTextEntry.connect('button-press-event', () => {
            this._sourceTextEntry.grab_key_focus();
            return Clutter.EVENT_PROPAGATE;
        });
        
        let sourceClutterText = this._sourceTextEntry.get_clutter_text();
        sourceClutterText.single_line_mode = false;
        sourceClutterText.line_wrap = true;
        sourceClutterText.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
        sourceClutterText.editable = true; // Ensure the ClutterText is editable
        
        // Aggiungo il campo di testo al contenitore
        sourceBox.add_child(this._sourceTextEntry);
        
        // Imposto il box come figlio dello ScrollView
        sourceScrollView.add_actor(sourceBox);
        
        // Handle scrolling when typing at the bottom
        sourceClutterText.connect('text-changed', () => {
            this._updateScroll(sourceScrollView);
        });
        
        sourceClutterText.connect('key-press-event', (actor, event) => {
            let symbol = event.get_key_symbol();
            if (symbol === Clutter.KEY_Return || symbol === Clutter.KEY_KP_Enter) {
                actor.insert_text('\n', actor.get_cursor_position());
                this._updateScroll(sourceScrollView);
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
        
        // Aggiungo lo ScrollView alla sezione di input
        inputSection.add_child(sourceScrollView);
        
        // Add the input section to main container
        mainContainer.add_child(inputSection);
        
        // Button to show/hide the context field
        this._showContextButton = new St.Button({
            style_class: 'gtranslator-button button',
            child: new St.Label({ text: _('+ Add Context') }),
            x_expand: false,
            x_align: Clutter.ActorAlign.START,
            can_focus: true,
            reactive: true,
            track_hover: true
        });
        mainContainer.add_child(this._showContextButton);
        
        // Container for the context field (initially hidden)
        this._contextContainer = new St.BoxLayout({
            vertical: true,
            style: 'spacing: 4px; margin-bottom: 10px;',
            visible: false
        });
        
        // Context text - label
        let contextLabel = new St.Label({
            text: _('Context (optional):'),
            style_class: 'gtranslator-label',
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true
        });
        this._contextContainer.add_child(contextLabel);
        
        // Creo un altro ScrollView per il campo di contesto
        let contextScrollView = new St.ScrollView({
            overlay_scrollbars: true,
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.AUTOMATIC,
            enable_mouse_scrolling: true,
            x_expand: true,
            y_expand: true,
            style: 'min-height: 80px; max-height: 80px;'
        });
        
        // Create a box container for the context entry
        let contextBox = new St.BoxLayout({ 
            style_class: 'gtranslator-entry',
            vertical: true,
            x_expand: true,
            y_expand: false, // Changed from true, so height is determined by content for scrolling
            style: 'min-height: 70px; padding: 8px;' // Kept min-height for the box itself
        });
        
        // Create the context entry
        this._contextEntry = new St.Entry({
            hint_text: _('Add optional context for translation'),
            track_hover: true,
            can_focus: true,
            reactive: true, // Added for consistency and to ensure focus
            x_expand: true,
            // y_expand: true, // Removed to allow natural height based on content
            style: 'border: none; background: none;' // Removed min-height, height will be content-driven
        });
        // Explicitly grab focus on click
        this._contextEntry.connect('button-press-event', () => {
            this._contextEntry.grab_key_focus();
            return Clutter.EVENT_PROPAGATE;
        });
        
        let contextClutterText = this._contextEntry.get_clutter_text();
        contextClutterText.single_line_mode = false;
        contextClutterText.line_wrap = true;
        contextClutterText.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
        contextClutterText.editable = true; // Ensure the ClutterText is editable
        
        // Aggiungo il campo al contenitore
        contextBox.add_child(this._contextEntry);
        
        // Imposto il box come figlio dello ScrollView
        contextScrollView.add_actor(contextBox);
        
        // Handle scrolling when typing at the bottom
        contextClutterText.connect('text-changed', () => {
            this._updateScroll(contextScrollView);
        });
        
        contextClutterText.connect('key-press-event', (actor, event) => {
            let symbol = event.get_key_symbol();
            if (symbol === Clutter.KEY_Return || symbol === Clutter.KEY_KP_Enter) {
                actor.insert_text('\n', actor.get_cursor_position());
                this._updateScroll(contextScrollView);
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
        
        // Aggiungo lo ScrollView al contenitore del contesto
        this._contextContainer.add_child(contextScrollView);
        
        // Add the context container to the main container
        mainContainer.add_child(this._contextContainer);
        
        // Container for target language and translate button
        let controlsContainer = new St.BoxLayout({
            style: 'spacing: 8px;'
        });
        
        // Target language - label
        let targetLangLabel = new St.Label({
            text: _('Language:'),
            style_class: 'gtranslator-label',
            y_align: Clutter.ActorAlign.CENTER
        });
        controlsContainer.add_child(targetLangLabel);
        
        // Create the dropdown for language selection
        let targetLanguageItem = new PopupMenu.PopupSubMenuMenuItem(
            this._getLanguageNameByCode(this._settings.get_string('target-language')) || 'Italiano'
        );
        
        // Populate the dropdown menu with supported languages
        for (let langCode in LANGUAGES) {
            let langItem = new PopupMenu.PopupMenuItem(LANGUAGES[langCode]);
            langItem.connect('activate', () => {
                this._settings.set_string('target-language', langCode);
                targetLanguageItem.label.text = LANGUAGES[langCode];
            });
            targetLanguageItem.menu.addMenuItem(langItem);
        }
        
        this._targetLanguageMenuItem = targetLanguageItem;
        
        // Create a widget to contain the dropdown menu
        let targetLanguageContainer = new St.Bin({
            child: targetLanguageItem,
            x_expand: true
        });
        
        // Translate button
        this._translateButton = new St.Button({
            style_class: 'button gtranslator-button',
            label: _('Translate'),
            x_expand: true,
            can_focus: true,
            reactive: true,
            track_hover: true
        });
        controlsContainer.add_child(targetLanguageContainer);
        controlsContainer.add_child(this._translateButton);
        mainContainer.add_child(controlsContainer);
        
        // Container for additional buttons
        let actionsContainer = new St.BoxLayout({
            style: 'spacing: 8px;',
            x_expand: true
        });
        
        // Button to translate from clipboard
        this._translateClipboardButton = new St.Button({
            style_class: 'button gtranslator-button',
            label: _('Translate from Clipboard'),
            can_focus: true,
            reactive: true,
            track_hover: true,
            x_expand: true
        });
        actionsContainer.add_child(this._translateClipboardButton);
        
        mainContainer.add_child(actionsContainer);
        
        // Loading indicator
        let loadingContainer = new St.BoxLayout({
            style: 'spacing: 8px;',
            visible: false
        });
        this._loadingIndicator = new St.Icon({
            icon_name: 'content-loading-symbolic',
            style_class: 'system-status-icon'
        });
        this._loadingLabel = new St.Label({
            text: _('Translation in progress...'),
            style_class: 'gtranslator-label',
            y_align: Clutter.ActorAlign.CENTER
        });
        loadingContainer.add_child(this._loadingIndicator);
        loadingContainer.add_child(this._loadingLabel);
        mainContainer.add_child(loadingContainer);
        this._loadingContainer = loadingContainer;
        
        // Translation result - label
        let targetLabel = new St.Label({
            text: _('Translation:'),
            style_class: 'gtranslator-label',
            y_align: Clutter.ActorAlign.CENTER
        });
        mainContainer.add_child(targetLabel);
        
        // Translation result - output field with improved scrollbar
        let resultContainer = new St.BoxLayout({
            style_class: 'gtranslator-result',
            vertical: true,
            x_expand: true,
            style: 'min-height: 80px; max-height: 200px;'
        });
        
        this._targetTextLabel = new St.Label({
            text: '',
            y_align: Clutter.ActorAlign.START,
            x_expand: true
        });
        
        // Set markup support in a compatible way
        if (this._targetTextLabel.clutter_text) {
            this._targetTextLabel.clutter_text.use_markup = true;
            this._targetTextLabel.clutter_text.line_wrap = true;
            this._targetTextLabel.clutter_text.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
        }
        
        resultContainer.add_child(this._targetTextLabel);
        mainContainer.add_child(resultContainer);
        
        // Copy notification - label (initially hidden)
        this._copiedNotification = new St.Label({
            text: _('Copied to clipboard!'),
            style_class: 'gtranslator-notification',
            opacity: 0
        });
        mainContainer.add_child(this._copiedNotification);
        
        // Add a menu item to contain the main container
        let menuItem = new PopupMenu.PopupBaseMenuItem({
            reactive: false,
            can_focus: false
        });
        menuItem.add_child(mainContainer);
        this.menu.addMenuItem(menuItem);
        
        // Add separator
        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
        
        // Preferences
        let preferencesMenuItem = new PopupMenu.PopupMenuItem(_('Preferences'));
        preferencesMenuItem.connect('activate', () => {
            ExtensionUtils.openPrefs();
        });
        this.menu.addMenuItem(preferencesMenuItem);
    }
    
    _connectSignals() {
        // Connect buttons to events
        this._translateButton.connect('clicked', () => {
            this._translateText(this._sourceTextEntry.get_text(), this._contextEntry.get_text());
        });
        
        this._translateClipboardButton.connect('clicked', () => {
            this._translateFromClipboard();
        });
        
        this._showContextButton.connect('clicked', () => {
            let visible = !this._contextContainer.visible;
            this._contextContainer.visible = visible;
            let buttonText = visible ? _('- Hide Context') : _('+ Add Context');
            this._showContextButton.child.text = buttonText;
            
            // When making the context visible, give focus to the field
            if (visible && this._contextEntry) {
                this._contextEntry.grab_key_focus();
            }
        });
    }
    
    _getLanguageNameByCode(code) {
        return LANGUAGES[code] || null;
    }
    
    _translateFromClipboard() {
        let clipboard = St.Clipboard.get_default();
        
        // First, try to get the text from the clipboard
        clipboard.get_text(St.ClipboardType.CLIPBOARD, (clipboard, text) => {
            if (text && text !== '') {
                // If there is text, use it directly
                this._sourceTextEntry.set_text(text);
                this._translateText(text, this._contextEntry ? this._contextEntry.get_text() : '');
            } else {
                // If there is no text, try to check if there is an image
                this._processClipboardImage();
            }
        });
    }
    
    _processClipboardImage() {
        try {
            // Change the loading text for text extraction
            this._loadingLabel.set_text(_('Extracting text from image...'));
            this._showLoading(true);
            
            // Use the helper script based on XClip to get the image from the clipboard
            const scriptPath = Me.dir.get_child('scripts').get_child('clipboard-image.sh').get_path();
            
            // Create a process to run the script
            try {
                let [success, pid, stdin, stdout, stderr] = GLib.spawn_async_with_pipes(
                    null, // working directory
                    ['/bin/bash', scriptPath], // command
                    null, // environment
                    GLib.SpawnFlags.SEARCH_PATH | GLib.SpawnFlags.DO_NOT_REAP_CHILD,
                    null // child setup function
                );
                
                // Monitor when the process ends
                GLib.child_watch_add(GLib.PRIORITY_DEFAULT, pid, (pid, status) => {
                    // Read the script output (temporary image file path or error message)
                    let stdoutStream = new Gio.DataInputStream({
                        base_stream: new Gio.UnixInputStream({ fd: stdout })
                    });
                    let stderrStream = new Gio.DataInputStream({
                        base_stream: new Gio.UnixInputStream({ fd: stderr })
                    });
                    
                    let [stdoutLine, stdoutLen] = stdoutStream.read_line_utf8(null);
                    let [stderrLine, stderrLen] = stderrStream.read_line_utf8(null);
                    
                    // Close the streams
                    stdoutStream.close(null);
                    stderrStream.close(null);
                    
                    // Handle the output
                    if (status !== 0 || !stdoutLine || stdoutLine.length === 0) {
                        // Script error
                        let errorMessage = stderrLine || 'No image found in clipboard';
                        this._showLoading(false);
                        this._showError(errorMessage);
                    } else {
                        // Success: we have the temporary file path
                        let tempFilePath = stdoutLine.trim();
                        log(`Image temporarily saved at: ${tempFilePath}`);
                        
                        try {
                            // Load the image from the temporary file
                            let pixbuf = GdkPixbuf.Pixbuf.new_from_file(tempFilePath);
                            
                            // Convert to base64
                            let [success, buffer] = pixbuf.save_to_bufferv('png', [], []);
                            if (success && buffer) {
                                let base64Image = GLib.base64_encode(buffer);
                                
                                // Delete the temporary file
                                let file = Gio.File.new_for_path(tempFilePath);
                                file.delete(null);
                                
                                // Extract text from the image
                                this._extractTextFromImage(base64Image);
                            } else {
                                this._showLoading(false);
                                this._showError('Unable to convert image for processing');
                                
                                // Delete the temporary file anyway
                                let file = Gio.File.new_for_path(tempFilePath);
                                file.delete(null);
                            }
                        } catch (e) {
                            this._showLoading(false);
                            this._showError(`Error processing image: ${e.message}`);
                            
                            // Delete the temporary file in case of error
                            try {
                                let file = Gio.File.new_for_path(tempFilePath);
                                file.delete(null);
                            } catch (deleteError) {
                                // Ignore errors in deletion
                            }
                        }
                    }
                    
                    // End the process
                    GLib.spawn_close_pid(pid);
                });
                
            } catch (e) {
                this._showLoading(false);
                this._showError(`Unable to execute script for image: ${e.message}`);
                log(`Error executing script: ${e.message}`);
            }
            
        } catch (e) {
            this._showLoading(false);
            this._showError(`Error accessing clipboard: ${e.message}`);
            log(`Error accessing clipboard: ${e.message}`);
        }
    }
    
    // Method to create an expanded text editor window
    _createExpandedTextEditor(title, initialText, callback) {
        // Create a new window
        let expandedWindow = new St.Window({
            style_class: 'gtranslator-expanded-window',
            width: 600,
            height: 400,
            track_hover: true
        });
        
        // Create a vertical layout for the window content
        let windowContent = new St.BoxLayout({
            vertical: true,
            style: 'spacing: 10px; padding: 16px;'
        });
        
        // Create a header with the title and close button
        let headerBox = new St.BoxLayout({
            style: 'spacing: 8px; margin-bottom: 8px;'
        });
        
        let titleLabel = new St.Label({
            text: title,
            style_class: 'gtranslator-expanded-title',
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true
        });
        headerBox.add_child(titleLabel);
        
        // Add close button
        let closeButton = new St.Button({
            style_class: 'gtranslator-button button',
            child: new St.Icon({ icon_name: 'window-close-symbolic', icon_size: 16 }),
            x_expand: false,
            can_focus: true,
            reactive: true,
            track_hover: true
        });
        headerBox.add_child(closeButton);
        
        // Add header to window
        windowContent.add_child(headerBox);
        
        // Create text entry with scrollview
        let scrollView = new St.ScrollView({
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.AUTOMATIC,
            y_expand: true,
            x_expand: true,
            enable_mouse_scrolling: true
        });
        
        // Create a container for the text entry
        let textContainer = new St.BoxLayout({ 
            vertical: true,
            x_expand: true,
            y_expand: true
        });
        
        // Create the actual text entry
        let textEntry = new St.Entry({
            style_class: 'gtranslator-expanded-entry',
            can_focus: true,
            reactive: true,
            x_expand: true,
            y_expand: true,
            style: 'min-height: 300px;'
        });
        
        if (initialText) {
            textEntry.set_text(initialText);
        }
        
        // Configure the ClutterText
        let clutterText = textEntry.get_clutter_text();
        clutterText.single_line_mode = false;
        clutterText.line_wrap = true;
        clutterText.editable = true;
        
        // Ensure proper text wrapping
        try {
            if (Pango && Pango.WrapMode) {
                clutterText.line_wrap_mode = Pango.WrapMode.WORD_CHAR;
            } else {
                clutterText.line_wrap_mode = 2; // WORD_CHAR = 2
            }
        } catch (e) {
            log('Warning: unable to set line wrap mode: ' + e.message);
        }
        
        // Set focus to the text entry when the window is created
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
            global.stage.set_key_focus(clutterText);
            return GLib.SOURCE_REMOVE;
        });
        
        // Connect handlers
        textEntry.connect('button-press-event', () => {
            global.stage.set_key_focus(clutterText);
            return Clutter.EVENT_PROPAGATE;
        });
        
        // Handle Enter key for multiline input
        clutterText.connect('key-press-event', (actor, event) => {
            let symbol = event.get_key_symbol();
            if (symbol === Clutter.KEY_Return || symbol === Clutter.KEY_KP_Enter) {
                actor.insert_text('\n', actor.get_cursor_position());
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });
        
        // Add save button
        let saveButton = new St.Button({
            style_class: 'button gtranslator-button',
            label: _('Save'),
            x_expand: false,
            can_focus: true,
            reactive: true,
            track_hover: true,
            style: 'margin-top: 8px;'
        });
        
        // Add the text entry to the container
        textContainer.add_child(textEntry);
        
        // Add the container to the scrollView
        scrollView.add_actor(textContainer);
        
        // Add elements to the window content
        windowContent.add_child(scrollView);
        windowContent.add_child(saveButton);
        
        // Set the window content
        expandedWindow.set_child(windowContent);
        
        // Add the window to the UI group to make it visible
        Main.uiGroup.add_child(expandedWindow);
        
        // Center the window on screen
        expandedWindow.set_position(
            Math.floor(global.screen_width / 2 - expandedWindow.width / 2),
            Math.floor(global.screen_height / 2 - expandedWindow.height / 2)
        );
        
        // Make the window modal to grab focus
        expandedWindow.make_modal();
        
        // Connect the close button
        closeButton.connect('clicked', () => {
            expandedWindow.destroy();
        });
        
        // Connect the save button
        saveButton.connect('clicked', () => {
            if (callback && typeof callback === 'function') {
                callback(textEntry.get_text());
            }
            expandedWindow.destroy();
        });
        
        // Return the window so it can be referenced later
        return expandedWindow;
    }
    
    // Show expanded source text editor
    _showSourceTextEditor() {
        this._expandedSourceWindow = this._createExpandedTextEditor(
            _('Edit Text to Translate'), 
            this._sourceTextEntry.get_text(),
            (text) => {
                if (text) {
                    this._sourceTextEntry.set_text(text);
                }
            }
        );
    }
    
    // Show expanded context editor
    _showContextEditor() {
        this._expandedContextWindow = this._createExpandedTextEditor(
            _('Edit Context'),
            this._contextEntry.get_text(),
            (text) => {
                if (text) {
                    this._contextEntry.set_text(text);
                }
            }
        );
    }
    
    // Helper method to automatically scroll down when needed
    _updateScroll(scrollView) {
        // Use a small delay to ensure the text has been rendered first
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 10, () => {
            // Scroll to the bottom of the view
            let adjustment = scrollView.vscroll.adjustment;
            adjustment.value = adjustment.upper - adjustment.page_size;
            return GLib.SOURCE_REMOVE;
        });
    }

    _extractTextFromImage(base64Image) {
        // Check if we have an API key
        const apiKey = this._settings.get_string('api-key');
        if (!apiKey || apiKey === '') {
            this._showLoading(false);
            this._showError('API key not configured. Go to preferences to configure it.');
            return;
        }
        
        // Prepare the HTTP request for the Gemini API
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
        let message = Soup.Message.new('POST', url);
        
        // Set the request header and body
        message.request_headers.append('Content-Type', 'application/json');
        
        // Prompt to extract text from the image
        const prompt = "Extract all text content from this image. If no text is found, respond with an empty string or a specific marker like '[NO_TEXT_FOUND]'. Please return ONLY the text found in the image, without any additional comments or explanations.";
        
        // Build the request body for Gemini
        let requestBody = JSON.stringify({
            contents: [{
                parts: [
                    {
                        inline_data: {
                            mime_type: 'image/png',
                            data: base64Image
                        }
                    },
                    {
                        text: prompt
                    }
                ]
            }],
            generationConfig: {
                temperature: 0.1,
                topK: 32,
                topP: 0.95,
                maxOutputTokens: 2048
            }
        });
        
        message.set_request_body_from_bytes('application/json', new GLib.Bytes(requestBody));
        
        // Send the request
        this._httpSession.queue_message(message, (session, message) => {
            this._loadingLabel.set_text(_('Translation in progress...'));
            
            if (message.status_code === 200) {
                try {
                    // Parse the JSON response
                    let jsonResponse = JSON.parse(message.response_body.data);
                    
                    if (jsonResponse &&
                        jsonResponse.candidates &&
                        jsonResponse.candidates[0] &&
                        jsonResponse.candidates[0].content &&
                        jsonResponse.candidates[0].content.parts &&
                        jsonResponse.candidates[0].content.parts[0]) {
                        
                        let extractedText = jsonResponse.candidates[0].content.parts[0].text.trim();
                        
                        // Check if text was found
                        if (extractedText === '' || extractedText === '[NO_TEXT_FOUND]') {
                            this._showLoading(false);
                            this._showError('No text found in image');
                            return;
                        }
                        
                        // Show the extracted text in the input field
                        this._sourceTextEntry.set_text(extractedText);
                        
                        // Proceed with translating the extracted text
                        this._translateText(extractedText, this._contextEntry ? this._contextEntry.get_text() : '');
                    } else {
                        this._showLoading(false);
                        this._showError('Invalid API response during text extraction.');
                    }
                } catch (e) {
                    this._showLoading(false);
                    this._showError(`Error parsing response: ${e.message}`);
                }
            } else {
                let errorMessage = 'Error extracting text from image';
                try {
                    let jsonResponse = JSON.parse(message.response_body.data);
                    if (jsonResponse && jsonResponse.error && jsonResponse.error.message) {
                        errorMessage = `API Error: ${jsonResponse.error.message}`;
                    }
                } catch (e) {
                    // If we can't parse the response, use the generic message
                }
                this._showLoading(false);
                this._showError(`${errorMessage} (${message.status_code})`);
            }
        });
    }

    _translateText(text, context = '') {
        // Check if we have text to translate
        if (!text || text.trim() === '') {
            this._showError('Enter text to translate');
            return;
        }
        
        // Check if we have an API key
        const apiKey = this._settings.get_string('api-key');
        if (!apiKey || apiKey === '') {
            this._showError('API key not configured. Go to preferences to configure it.');
            return;
        }
        
        // Get the selected target language
        let targetLang = this._settings.get_string('target-language');
        
        // Build the prompt for Gemini
        let prompt = '';
        if (context && context.trim() !== '') {
            prompt = `Translate the following text into ${this._getLanguageNameByCode(targetLang)} (language code: ${targetLang}), considering the following context: '${context.trim()}'. Return only the translated text, without comments or explanations. Text to translate: '${text.trim()}'`;
        } else {
            prompt = `Translate the following text into ${this._getLanguageNameByCode(targetLang)} (language code: ${targetLang}). Return only the translated text, without comments or explanations. Text to translate: '${text.trim()}'`;
        }
        
        // Show the loading indicator
        this._showLoading(true);
        
        // Prepare the HTTP request for the Gemini API
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
        let message = Soup.Message.new('POST', url);
        
        // Set the request header and body
        message.request_headers.append('Content-Type', 'application/json');
        
        // Build the request body for Gemini
        let requestBody = JSON.stringify({
            contents: [{
                parts: [{
                    text: prompt
                }]
            }],
            generationConfig: {
                temperature: 0.2, // Low temperature for more coherent response
                topK: 40,
                topP: 0.95,
                maxOutputTokens: 2048
            }
        });
        
        message.set_request_body_from_bytes('application/json', new GLib.Bytes(requestBody));
        
        // Send the request
        this._httpSession.queue_message(message, (session, message) => {
            // Hide the loading indicator
            this._showLoading(false);
            
            if (message.status_code === 200) {
                try {
                    // Parse the JSON response
                    let jsonResponse = JSON.parse(message.response_body.data);
                    
                    if (jsonResponse &&
                        jsonResponse.candidates &&
                        jsonResponse.candidates[0] &&
                        jsonResponse.candidates[0].content &&
                        jsonResponse.candidates[0].content.parts &&
                        jsonResponse.candidates[0].content.parts[0]) {
                        
                        let translatedText = jsonResponse.candidates[0].content.parts[0].text;
                        
                        // Show the translated text
                        this._targetTextLabel.set_text(translatedText);
                        
                        // If auto-copy is enabled, copy to clipboard
                        if (this._settings.get_boolean('auto-copy')) {
                            St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, translatedText);
                            this._showCopiedNotification();
                        }
                    } else {
                        this._showError('Invalid API response.');
                    }
                } catch (e) {
                    this._showError(`Error parsing response: ${e.message}`);
                }
            } else {
                let errorMessage = 'API call error';
                try {
                    let jsonResponse = JSON.parse(message.response_body.data);
                    if (jsonResponse && jsonResponse.error && jsonResponse.error.message) {
                        errorMessage = `API Error: ${jsonResponse.error.message}`;
                    }
                } catch (e) {
                    // If we can't parse the response, use the generic message
                }
                this._showError(`${errorMessage} (${message.status_code})`);
            }
        });
    }
    
    _showError(message) {
        if (this._targetTextLabel) {
            this._targetTextLabel.set_text(`Error: ${message}`);
            this._targetTextLabel.add_style_class_name('error');
            
            // Remove the error class after a while
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 3000, () => {
                if (this._targetTextLabel) {
                    this._targetTextLabel.remove_style_class_name('error');
                }
                return GLib.SOURCE_REMOVE;
            });
        }
    }
    
    _showLoading(show) {
        this._isLoading = show;
        this._loadingContainer.visible = show;
        this._translateButton.reactive = !show;
        this._translateButton.can_focus = !show;
        this._translateClipboardButton.reactive = !show;
        this._translateClipboardButton.can_focus = !show;
        
        if (show) {
            // Add a simple animation for the loading icon
            this._loadingIconTimeout = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
                if (!this._isLoading) {
                    return GLib.SOURCE_REMOVE;
                }
                
                let rotation = this._loadingIndicator.get_rotation_angle(Clutter.RotateAxis.Z_AXIS);
                rotation = (rotation + 10) % 360;
                this._loadingIndicator.set_rotation_angle(Clutter.RotateAxis.Z_AXIS, rotation);
                
                return GLib.SOURCE_CONTINUE;
            });
        } else if (this._loadingIconTimeout) {
            GLib.source_remove(this._loadingIconTimeout);
            this._loadingIconTimeout = null;
        }
    }
    
    _showCopiedNotification() {
        // Show "Copied!" notification
        this._copiedNotification.opacity = 255;
        
        // Fade out the notification after 2 seconds
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2000, () => {
            // Fade-out animation
            let fadeEffect = Clutter.PropertyTransition.new('opacity');
            fadeEffect.set_duration(500);
            fadeEffect.set_to(0);
            this._copiedNotification.add_transition('fade-out', fadeEffect);
            return GLib.SOURCE_REMOVE;
        });
    }
});

function init() {
    ExtensionUtils.initTranslations(GETTEXT_DOMAIN);
    return new GTranslatorExtension();
}

function enable() {
    return ExtensionUtils.getCurrentExtension().object.enable();
}

function disable() {
    return ExtensionUtils.getCurrentExtension().object.disable();
}
