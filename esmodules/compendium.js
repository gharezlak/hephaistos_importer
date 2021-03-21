import * as SFHI from './log.js';

export async function findRace(name) {
    return await findInCompendium('Races', name);
}

export async function findTheme(name) {
    return await findInCompendium('Themes', name);
}

export async function findClass(name) {
    return await findInCompendium('Classes', name);
}

export async function findFeat(name, isCombatFeat) {
    if (isCombatFeat) {
        name += ' (Combat)';
    }

    return await findInCompendium('Feats', name);
}

export async function findEquipment(name) {
    return await findInCompendium('Equipment', name);
}

export async function findSpell(name) {
    return await findInCompendium('Spells', name);
}

// An object to remember already calculated levenshtein distances
let distances = {};

async function findInCompendium(compendiumName, name) {
    if (!name) {
        return undefined;
    }
    
    const compendium = game.packs.find(element => element.title.includes(compendiumName));
    if (!compendium) {
        SFHI.error(`No compendium named '${compendiumName}' found.`);
        return undefined;
    }

    await compendium.getIndex();
    let foundEntry = undefined;
    let foundLevDistance = 5; // Limit the max differences to 5. This allows for missing commas or other similarly minor changes

    for (const entry of compendium.index) {
        const lowerCaseEntry = entry.name.toLowerCase();
        const lowerCaseName = name.toLowerCase();
        if (lowerCaseEntry === lowerCaseName) {
            foundEntry = await compendium.getEntry(entry._id);
            foundLevDistance = 0;
            break;
        }

        const levDistance = levenshtein_distance(lowerCaseEntry, lowerCaseName);
        if (levDistance <= foundLevDistance) {
            foundEntry = await compendium.getEntry(entry._id);
            foundLevDistance = levDistance;
        }
    }

    // Clear the object before next run.
    distances = {};

    if (!foundEntry) {
        SFHI.warn(`No item named '${name}' found in compendium '${compendiumName}'`);
        return undefined;
    }

    if (foundLevDistance > 0) {
        SFHI.warn(`Exact match for '${name}' not found in compendium '${compendiumName}'. Using '${foundEntry.name}' (lev distance = ${foundLevDistance}) instead.`);
    }

    return foundEntry;
}

function levenshtein_distance(a, b) {
    if (distances[a]?.[b] !== undefined) {
        return distances[a][b];
    }

    if (!b || !b.length) {
        return a.length;
    }

    if (!a || !a.length) {
        return b.length;
    }

    const tailA = a.substr(1);
    const tailB = b.substr(1);

    if (a.charAt(0) === b.charAt(0)) {
        return levenshtein_distance(tailA, tailB);
    }

    if (distances[a] === undefined) {
        distances[a] = {}
    }

    distances[a][b] = 1 + Math.min(levenshtein_distance(tailA, b), levenshtein_distance(a, tailB), levenshtein_distance(tailA, tailB));
    return distances[a][b];
}