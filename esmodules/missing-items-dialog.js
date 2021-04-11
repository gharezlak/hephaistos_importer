export class HephaistosMissingItemsDialog extends Dialog {
    constructor(dialogData, options) {
        super(dialogData, options);
    }

    activateListeners(html) {
        super.activateListeners(html);
        html.find('form#sfhi-missing-items-dialog-form input[type=text]').on('input', (event) => {
            const index = parseInt(event.target.id);
            this.items[index].compendium = event.target.value;
        });
    }

    static createAndShow(items) {
        this.items = items;
        return new Promise(async (resolve, reject) => {
            const html = await renderTemplate('modules/hephaistos-importer/templates/missing-items-dialog.html', {
                items: items,
            });

            let dialog = new HephaistosMissingItemsDialog({
                title: 'Hephaistos Importer - Item Mapping',
                content: html,
                buttons: {
                    continue: {
                        icon: '<i class="fas fa-check"></i>',
                        label: 'Continue',
                        callback: () =>  resolve(this.items),
                    },
                    cancel: {
                        icon: '<i class="fas fa-times"></i>',
                        label: 'Cancel',
                        callback: () => reject(undefined),
                    },
                },
            });
            
            dialog.items = items;
            dialog.render(true);
        });
    }
}