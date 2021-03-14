import * as SFHI from './log.js';

export async function findRace(name) {
    return await findInCompendiium('Races', name);
}

export async function findTheme(name) {
    return await findInCompendiium('Themes', name);
}

export async function findClass(name) {
    return await findInCompendiium('Classes', name);
}

export async function findFeat(name, isCombatFeat) {
    if (isCombatFeat) {
        name += ' (Combat)';
    }

    return await findInCompendiium('Feats', name);
}

export async function findEquipment(name) {
    return await findInCompendiium('Equipment', name);
}

export async function findSpell(name) {
    return await findInCompendiium('Spells', name);
}

export async function findInCompendiium(compendiumName, name) {
    const compendium = game.packs.find(element => element.title.includes(compendiumName));
    if (!compendium) {
        SFHI.error(`No compendium named '${compendiumName}' found.`);
        return undefined;
    }

    await compendium.getIndex();
    let foundEntry = undefined;
    for (const entry of compendium.index) {
        if (entry.name.toLowerCase() === name.toLowerCase()) {
            foundEntry = compendium.getEntry(entry._id);
            break;
        }
    }

    if (!foundEntry) {
        SFHI.warn(`No item named '${name}' found in compendium '${compendiumName}'`);
    }
    return foundEntry;
}