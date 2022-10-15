import * as SFHI from './log.js';

const modifierMapping = [
    ['character.level', '@details.level.value'],
    ['character.bab', '@details.baseAttackBonus.value'],
];

const effectTypeMapping = [
    ['character.damage.operativeMelee', 'weapon-property-damage'],
    [/character\.damage\..*/, 'weapon-damage'],
    [/character\.attack\..*/, 'weapon-attacks'],
];

const valueAffectedMapping = [
    [/.*basicMelee/, 'basicM'],
    [/.*advancedMelee/, 'advancedM'],
    [/.*smallArm/, 'smallA'],
    [/.*longarm/, 'longA'],
    [/.*heavyWeapon/, 'heavy'],
    [/.*sniper/, 'sniper'],
    [/.*grenade/, 'grenade'],
    [/.*special/, ''],
    [/.*solarian/, ''],
];

const weaponTypeMapping = [
    ['basicMelee', 'bmelee'],
    ['advancedMelee', 'amelee'],
    ['smallArm', 'sarms'],
    ['longarm', 'larms'],
    ['heavyWeapon', 'hweap'],
    ['sniper', 'snipe'],
    ['grenade', 'gren'],
    ['special', 'spec'],
];

const armorTypeMapping = [
    ['light', 'lgt'],
    ['heavy', 'hvy'],
    ['powered', 'pwr'],
    ['shield', 'shl'],
];

function convert(mapping, value) {
    for (const [pattern, result] of mapping) {
        if (typeof pattern === 'string') {
            if (value === pattern) {
                return result;
            }
        } else if (value.match(pattern)) {
            return result;
        }
    }

    return undefined;
}

function parseMathOperand(operand) {
    if (operand.property) {
        return convert(modifierMapping, operand.property);
    } else if (operand.int) {
        return `${operand.int}`;
    } else if (operand.math) {
        return `(${parseMath(operand.math)})`;
    }

    throw new Error(`Unknown Math Operand: ${JSON.stringify(operand)}`);
}

function parseMath(math) {
    let op;
    switch (math.operator) {
        case 'add':
            op = '+'
            break;
        case 'mul':
            op = '*"'
            break;
        case 'div':
            op = '/'
            break;
        case 'sub':
            op = '-'
            break;
    }

    const left = parseMathOperand(math.left);
    const right = parseMathOperand(math.right);

    if (math.operator === 'div') {
        return `floor(${left}${op}${right})`;
    } else {
        return `${left}${op}${right}`;
    }
}

function parseBonus(source, bonus) {
    let mod;
    if (bonus.value.math) {
        mod = parseMath(bonus.value.math);
    } else if (bonus.value.int) {
        mod = `${bonus.value.int}`;
    } else if (bonus.value.property) {
        mod = convert(modifierMapping, bonus.value.property);
    }

    if (!mod) {
        SFHI.warn(`Failed to parse bonus from '${source}': ${JSON.stringify(bonus)}`);
        return undefined;
    }

    let type;
    switch (bonus.bonusType) {
        case 'racial':
            type = 'racial';
            break;
        case 'enhancement':
            type = 'enhancement';
            break;
        case 'insight':
            type = 'insight';
            break;
        case 'misc':
            type = 'untyped';
            break;
        case 'shield':
            type = 'shield';
            break;
        case 'specialization':
            type = 'untyped';
            break;
        case 'circumstance':
            type = 'circumstance';
            break;
        case 'morale':
            type = 'morale';
            break;
    }

    const effectType = convert(effectTypeMapping, bonus.property);
    const valueAffected = convert(valueAffectedMapping, bonus.property);

    if (!effectType) {
        SFHI.warn(`Failed to parse effectType from '${source}': ${JSON.stringify(bonus)}`);
        return undefined;
    }

    if (!valueAffected) {
        SFHI.warn(`Failed to parse valueAffected from '${source}': ${JSON.stringify(bonus)}`);
        return undefined;
    }

    return {
        name: source,
        modifier: mod,
        type: type,
        effectType: effectType,
        valueAffected: valueAffected,
        enabled: true,
        source: '',
        notes: '',
        modifierType: 'constant',
        condition: '',
        subtab: 'misc',
        _id: uuidv4(),
    }
}

export async function parseAppend(actorData, params) {
    if (params.property === 'character.proficiency.weapon') {
        const value = convert(weaponTypeMapping, params.value?.weaponType);
        if (!value) {
            return;
        }

        if (!actorData.system.traits.weaponProf) {
            actorData.system.traits.weaponProf = {};
        }

        if (actorData.system.traits.weaponProf.value) {
            actorData.system.traits.weaponProf.value.push(value);
        } else {
            actorData.system.traits.weaponProf.value = [value];
        }
    } else if (params.property === 'character.proficiency.armor') {
        const value = convert(armorTypeMapping, params.value?.armorType);
        if (!value) {
            return;
        }

        if (!actorData.system.traits.armorProf) {
            actorData.system.traits.armorProf = {};
        }

        if (actorData.system.traits.armorProf.value) {
            actorData.system.traits.armorProf.value.push(value);
        } else {
            actorData.system.traits.armorProf.value = [value];
        }
    }
}

export async function parseEffect(actorData, source, effect) {
    if (effect.bonus) {
        return parseBonus(source, effect.bonus);
    } else if (effect.append) {
        return await parseAppend(actorData, effect.append);
    }

    return undefined;
}

function uuidv4() {
    return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
        (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
    );
}
