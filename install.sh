#!/bin/bash

# Script di installazione per l'estensione GNOME Shell GTranslator

# Colori per output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Funzione per verificare se un programma è installato
check_dependency() {
    if ! command -v $1 &> /dev/null; then
        echo -e "${RED}Errore: $1 non trovato. Si prega di installare $1.${NC}"
        exit 1
    fi
}

# Controllo parametri
uninstall=false

while [[ $# -gt 0 ]]; do
    key="$1"
    case $key in
        -u|--uninstall)
            uninstall=true
            shift
            ;;
        *)
            echo -e "${RED}Parametro non riconosciuto: $key${NC}"
            echo "Uso: ./install.sh [-u|--uninstall]"
            exit 1
            ;;
    esac
done

# Controllo dipendenze
check_dependency "glib-compile-schemas"

# Ottieni il percorso dello script
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Ottieni l'UUID dell'estensione dal file metadata.json
if [ -f "$SCRIPT_DIR/gtranslator@example.com/metadata.json" ]; then
    UUID="gtranslator@example.com"
    echo -e "${BLUE}UUID dell'estensione: $UUID${NC}"
else
    echo -e "${RED}Errore: file metadata.json non trovato.${NC}"
    exit 1
fi

# Directory di destinazione per l'estensione
EXTENSION_DIR="$HOME/.local/share/gnome-shell/extensions/$UUID"
SCHEMAS_DIR="$HOME/.local/share/glib-2.0/schemas"

if [ "$uninstall" = true ]; then
    echo -e "${YELLOW}Disinstallazione dell'estensione $UUID...${NC}"
    
    # Rimuovi l'estensione
    if [ -d "$EXTENSION_DIR" ]; then
        rm -rf "$EXTENSION_DIR"
        echo -e "${GREEN}✓ Cartella estensione rimossa.${NC}"
    else
        echo -e "${YELLOW}⚠ Cartella estensione non trovata.${NC}"
    fi
    
    # Rimuovi lo schema
    if [ -f "$SCHEMAS_DIR/org.gnome.shell.extensions.gtranslator.gschema.xml" ]; then
        rm "$SCHEMAS_DIR/org.gnome.shell.extensions.gtranslator.gschema.xml"
        echo -e "${GREEN}✓ Schema rimosso.${NC}"
        
        # Compila gli schemi
        glib-compile-schemas "$SCHEMAS_DIR"
        echo -e "${GREEN}✓ Schemi compilati.${NC}"
    else
        echo -e "${YELLOW}⚠ File schema non trovato.${NC}"
    fi
    
    echo -e "${GREEN}Disinstallazione completata.${NC}"
    echo -e "${YELLOW}Nota: Potrebbe essere necessario riavviare GNOME Shell per applicare le modifiche.${NC}"
    if [ "$XDG_SESSION_TYPE" = "wayland" ]; then
        echo -e "${YELLOW}Poiché stai usando Wayland, dovrai effettuare il logout e il login per riavviare GNOME Shell.${NC}"
    else
        echo -e "${YELLOW}Puoi riavviare GNOME Shell premendo Alt+F2, digitando 'r' e premendo Invio.${NC}"
    fi
    
    exit 0
fi

# Installazione
echo -e "${BLUE}Installazione dell'estensione $UUID...${NC}"

# Crea le directory necessarie se non esistono
mkdir -p "$EXTENSION_DIR"
mkdir -p "$EXTENSION_DIR/schemas"
mkdir -p "$SCHEMAS_DIR"

# Copia i file dell'estensione
cp -r "$SCRIPT_DIR/$UUID"/* "$EXTENSION_DIR/"
echo -e "${GREEN}✓ File dell'estensione copiati.${NC}"

# Copia e compila gli schemi a livello di sistema
cp "$SCRIPT_DIR/$UUID/schemas/org.gnome.shell.extensions.gtranslator.gschema.xml" "$SCHEMAS_DIR/"
glib-compile-schemas "$SCHEMAS_DIR"
echo -e "${GREEN}✓ Schema copiato e compilato a livello di sistema.${NC}"

# Compila gli schemi anche nella cartella dell'estensione
glib-compile-schemas "$EXTENSION_DIR/schemas"
echo -e "${GREEN}✓ Schema compilato nella cartella dell'estensione.${NC}"

# Imposta i permessi corretti
chmod -R +r "$EXTENSION_DIR"
echo -e "${GREEN}✓ Permessi impostati.${NC}"

echo -e "${GREEN}Installazione completata con successo!${NC}"

# Istruzioni per l'utente
echo ""
echo -e "${YELLOW}Per abilitare l'estensione, usa una delle seguenti opzioni:${NC}"
echo -e "1. ${BLUE}Usa GNOME Extensions app${NC} (se installata)"
echo -e "2. ${BLUE}Esegui:${NC} gnome-extensions enable $UUID"
echo -e "3. ${BLUE}Usa GNOME Tweaks${NC} (se installato)"
echo ""
echo -e "${YELLOW}Potrebbe essere necessario riavviare GNOME Shell per vedere l'estensione:${NC}"
if [ "$XDG_SESSION_TYPE" = "wayland" ]; then
    echo -e "${YELLOW}Poiché stai usando Wayland, dovrai effettuare il logout e il login per riavviare GNOME Shell.${NC}"
else
    echo -e "${YELLOW}Puoi riavviare GNOME Shell premendo Alt+F2, digitando 'r' e premendo Invio.${NC}"
fi
echo ""
echo -e "${YELLOW}Nota importante:${NC} Dovrai configurare la tua API Key di Google Gemini nelle preferenze dell'estensione."