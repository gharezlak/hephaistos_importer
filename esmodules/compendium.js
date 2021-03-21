import * as SFHI from './log.js';

export async function findRace(race) {
    if (!race) {
        return undefined;
    }

    let name = race.name;
    if (race.abilityAdjustment.name !== 'Standard') {
        name += ' ' + race.abilityAdjustment.name
    }

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

    // Limit the max differences to 4. This allows only for minor differences.
    const MAX_LEVENSHTEIN_DISTANCE = 4;
    let foundEntryId = undefined;
    let foundLevDistance = MAX_LEVENSHTEIN_DISTANCE;

    for (const entry of compendium.index) {
        const res = fuzzyEquals(entry.name, name, MAX_LEVENSHTEIN_DISTANCE);
        
        if (res === 0) {
            foundEntryId = entry._id;
            foundLevDistance = 0;
            break;
        } else if (res > 0 && res <= foundLevDistance) {
            foundEntryId = entry._id;
            foundLevDistance = res;
        }
    }

    // Clear the object before next run.
    distances = {};

    if (!foundEntryId) {
        SFHI.warn(`No item named '${name}' found in compendium '${compendiumName}'`);
        return undefined;
    }

    const foundEntry = await compendium.getEntry(foundEntryId);
    if (foundLevDistance > 0) {
        SFHI.warn(`Exact match for '${name}' not found in compendium '${compendiumName}'. Using '${foundEntry.name}' (lev distance = ${foundLevDistance}) instead.`);
    }

    return foundEntry;
}

function fuzzyEquals(a, b, distanceThreshold) {
    // Remove punctuation, brackets and other such symbols and split the strings
    // into "words" using whitespace
    const processedA = processString(a);
    const processedB = processString(b);
    
    if (processedA === processedB) {
        return 0;
    }

    // Artificially add to the processed arrays to make them of equal length
    while (processedA.length < processedB.length) {
        processedA.push('');
    }
    
    while (processedB.length < processedA.length) {
        processedB.push('');
    }

    // Derive the total Levenshtein distance between the two processed strings
    let distance = 0;
    for (const elemA of processedA) {
        // Find the minimum distance for elemA by comparing it to all words in
        // processedB
        let localDistance = distanceThreshold + 1;
        for (const elemB of processedB) {
            if (elemA === elemB) {
                localDistance = 0;
                break;
            }
            let levDistance = levenshteinDistance(elemA, elemB);
            if (levDistance < localDistance) {
                localDistance = levDistance;
            }
        }

        distance += localDistance;
        if (distance > distanceThreshold) {
            return -1;
        }
    }

    return distance;
}

function processString(str) {
    return str.toLowerCase()
        .replace(',', '')
        .replace('.', '')
        .replace('!', '')
        .replace('(', '')
        .replace(')', '')
        .split(' ')
        .sort();
}

function levenshteinDistance(a, b) {
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
        return levenshteinDistance(tailA, tailB);
    }

    if (distances[a] === undefined) {
        distances[a] = {}
    }

    distances[a][b] = 1 + Math.min(levenshteinDistance(tailA, b), levenshteinDistance(a, tailB), levenshteinDistance(tailA, tailB));
    return distances[a][b];
}