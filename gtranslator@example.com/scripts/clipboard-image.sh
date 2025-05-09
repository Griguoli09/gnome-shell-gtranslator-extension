#!/bin/bash

# Script per gestire le immagini dagli appunti utilizzando XClip
# Questo script salva l'immagine dagli appunti in un file temporaneo
# e restituisce il percorso del file

# Verifica che xclip sia installato
if ! command -v xclip &> /dev/null; then
    echo "XClip non è installato. Per favore installa xclip con: sudo apt-get install xclip" >&2
    exit 1
fi

# Crea un file temporaneo per salvare l'immagine
TEMP_FILE=$(mktemp --suffix=.png)

# Salva l'immagine dagli appunti nel file temporaneo
xclip -selection clipboard -t image/png -o > "$TEMP_FILE" 2>/dev/null

# Verifica che l'operazione abbia avuto successo
if [ $? -ne 0 ] || [ ! -s "$TEMP_FILE" ]; then
    echo "Nessuna immagine trovata negli appunti o errore durante il salvataggio" >&2
    rm "$TEMP_FILE"
    exit 1
fi

# Se tutto è andato bene, restituisci il percorso del file
echo "$TEMP_FILE"
exit 0