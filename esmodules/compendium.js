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

export async function findSpeciesTrait(name) {
    return await findInCompendium('Species Features', name);
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
    let nameMap = new Map([
        ['Battery, Standard', 'Battery'],
        ["Tool Kit (Catalyst Rig)", "Tool Kit, Akinzi Resources, Catalyst Rig"],
        ["Tool Kit (Grifter’s Kit)", "Tool Kit, Akinzi Resources, Grifter’s Kit"],
        ["Tool Kit (Gymnast’s Kit)", "Tool Kit, Akinzi Resources, Gymnast’s Kit"],
        ["Tool Kit (Influencer Kit)", "Tool Kit, Akinzi Resources, Influencer Kit"],
        ["Tool Kit (Swimmer’s Kit)", "Tool Kit, Akinzi Resources, Swimmer’s Kit"],
        ["Tool Kit (Tourist’s Kit)", "Tool Kit, Akinzi Resources, Tourist’s Kit"],
        ["Tool Kit (Tracker’s Kit)", "Tool Kit, Akinzi Resources, Tracker's Kit"],
        ["Tool Kit (Disguise Kit)", "Tool Kit, Disguise Kit"],
        ["Tool Kit (Engineering Kit)", "Tool Kit, Engineering Kit"],
        ["Tool Kit, Engineering Specialty", "Tool Kit, Engineering Specialty"],
        ["Tool Kit, (Armorcrafter Kit)", "Tool Kit, Engineering Specialty, Armorcrafter Kit"],
        ["Tool Kit, (Weaponsmithing Kit)", "Tool Kit, Engineering Specialty, Weaponsmithing Kit"],
        ["Tool Kit (Hacking Kit)", "Tool Kit, Hacking Kit"],
        ["Tool Kit (Navigator's Tools)", "Tool Kit, Navigator's Tools"],
        ["Tool Kit (Professional's Tools)", "Tool Kit, Professional's Tools"],
        ["Tool Kit (Rider's Kit)", "Tool Kit, Rider's Kit"],
        ["Tool Kit (Animal Trainer's Kit)", "Tool Kit, Starfinder Armory, Animal Trainer’s Kit"],
        ["Tool Kit (Aura-Translation Kit)", "Tool Kit, Starfinder Armory, Aura-Translation Kit"],
        ["Tool Kit (Broad-Spectrum Scanning Kit)", "Tool Kit, Starfinder Armory, Broad-Spectrum Scanning Kit"],
        ["Tool Kit (Light-Scattering Sniper's Blind)", "Tool Kit, Starfinder Armory, Light-Scattering Sniper’s Blind"],
        ["Tool Kit (Mental Interpretation Kit)", "Tool Kit, Starfinder Armory, Mental Interpretation Kit"],
        ["Tool Kit (Personal Gravitational Redistributor)", "Tool Kit, Starfinder Armory, Personal Gravitational Redistributor"],
        ["Tool Kit (Thieves' Tools)", "Tool Kit, Starfinder Armory, Thieves’ Tools"],
        ["Tool Kit (Trapsmith's Tools)", "Tool Kit, Trapsmith's Tools"],
        ["Tool Kit (Climbing Kit)", "Tool Kit, Xhinti Holdings, Climbing Kit"],
        ["Tool Kit (Demolitionist's Kit)", "Tool Kit, Xhinti Holdings, Demolitionist’s Kit"],
        ["Tool Kit (Linguist's Kit)", "Tool Kit, Xhinti Holdings, Linguist’s Kit"],
        ["Tool Kit (Portable Weather Station)", "Tool Kit, Xhinti Holdings, Portable Weather Station"],
        ["Tool Kit (Starship Repair Kit)", "Tool Kit, Xhinti Holdings, Starship Repair Kit"],
        ["Tool Kit (Survivalist's Kit)", "Tool Kit, Xhinti Holdings, Survivalist’s Kit"],
    ]);

    let newName = nameMap.has(name) ? nameMap.get(name) : name;

    return await findInCompendium('Equipment', newName);
}

export async function findSpell(name) {
    return await findInCompendium('Spells', name);
}

export async function findClassFeature(feature) {
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
