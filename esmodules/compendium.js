import * as SFHI from './log.js';

export async function findRace(race, abilityAdjustment) {
    if (!race) {
        return undefined;
    }

    let name = race.name;
    if (abilityAdjustment && processString(abilityAdjustment, true).join(' ') !== 'standard') {
        name += ' (' + abilityAdjustment + ')';
    }

    return await findInCompendium('Species', name, false);
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
    if (name === 'Battery, Standard') {
        name = 'Battery';
    }

    return await findInCompendium('Equipment', name);
}

export async function findSpell(name) {
    return await findInCompendium('Spells', name);
}

export async function findClassFeature(feature) {
    if (feature.startsWith('Weapon Specialization')) {
        return undefined;
    }

    return await findInCompendium('Class Features', feature);
}

export async function findStarshipComponent(name) {
    return await findInCompendium('Starship Components', name);
}

// An object to remember already calculated levenshtein distances
let distances = {};

async function findInCompendium(compendiumName, name, ignoreBracketedContent = true) {
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
        const res = fuzzyEquals(entry.name, name, MAX_LEVENSHTEIN_DISTANCE, ignoreBracketedContent);

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
        return { query: name };
    }

    const foundEntry = await compendium.getDocument(foundEntryId);
    if (foundLevDistance > 0) {
        SFHI.warn(`Exact match for '${name}' not found in compendium '${compendiumName}'. Using '${foundEntry.name}' (Levenshtein Distance = ${foundLevDistance}) instead.`);
    }
    return { query: name, value: foundEntry.clone(), exact: foundLevDistance <= 0 };
}

function fuzzyEquals(a, b, distanceThreshold, ignoreBracketedContent) {
    // Remove punctuation, brackets and other such symbols and split the strings
    // into "words" using whitespace
    const processedA = processString(a, ignoreBracketedContent);
    const processedB = processString(b, ignoreBracketedContent);

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

function processString(str, removeBracketedContent) {
    return str.toLowerCase()
        .replace(' (magic)', '')
        .replace(' (hybrid)', '')
        .replace('’', '\'')
        .replace(removeBracketedContent ? / \(.*\)/i : '', '')
        .replace(removeBracketedContent ? / \[.*\]/i : '', '')
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
