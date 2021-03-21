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
            
            let loadingDialog = new Dialog({
                title: 'Hephaistos Importer',
                content: `
                    <div style="text-align:center;">
                        <p style="font-size: 2rem; margin: 0.25em 0;">
                            <i class="fas fa-cog" style="animation: rotation 2.5s infinite linear;"></i>
                        </p>
                        <p>Importing...</p>
                    </div>`,
                buttons: {},
            });

            loadingDialog.render(true);

            const text = await file.text();
            await importJson(JSON.parse(text));

            await loadingDialog.close();
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

