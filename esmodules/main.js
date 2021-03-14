import { HephaistosImportDialog } from './import-dialog.js';
import { importJson } from './importer.js';

function addImportButton() {
    if (!Actor.can(game.user, 'create')) {
        return;
    }

    const importButtonId = 'sfhi-import-button';
    let importButton = document.getElementById(importButtonId);
    if (importButton != null) {
        return;
    }

    const actorsPanel = document.getElementById('actors');
    const actorFooter = actorsPanel.getElementsByClassName('directory-footer')[0];
    if (actorFooter) {
        importButton = document.createElement('button');
        importButton.innerHTML = `<i id='${importButtonId}' class="fas fa-file-import"></i> Import From Hephaistos`;
        importButton.onclick = async ev => {
            const file = await HephaistosImportDialog.createAndShow();
            if (!file) {
                return;
            }

            const text = await file.text();
            importJson(JSON.parse(text));
        };

        const createEntityButton = actorFooter.getElementsByClassName('create-entity')[0];
        actorFooter.insertBefore(importButton, createEntityButton);
    }
}

/** Ensure the 'Parse Statblock' button is visible. */
Hooks.on('renderSidebarTab', async (app, html) => {
    if (app.options.id == 'actors') {
        addImportButton();
    }
});

