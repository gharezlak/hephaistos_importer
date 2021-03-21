export class HephaistosImportDialog extends Dialog {
    constructor(dialogData, options) {
        super(dialogData, options);
    }

    activateListeners(html) {
        super.activateListeners(html);
        this.fileInput = html.find("#sfhi-import-dialog-file-input")[0];
    }

    static createAndShow() {
        return new Promise(async resolve => {
            const html = await renderTemplate('modules/hephaistos-importer/templates/import-dialog.html');
            const dialog = new HephaistosImportDialog({
                title: 'Hephaistos Importer',
                content: html,
                buttons: {
                    import: {
                        icon: '<i class="fas fa-file-import"></i>',
                        label: 'Import',
                        callback: () =>  resolve(dialog.fileInput.files[0]),
                    },
                    cancel: {
                        icon: '<i class="fas fa-times"></i>',
                        label: 'Cancel',
                        callback: () => resolve(undefined),
                    },
                },
            });
        
            dialog.render(true);
        });
    }
}
