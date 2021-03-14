import { findRace, findTheme, findClass, findFeat, findEquipment, findSpell } from './compendium.js';

export async function importJson(data) {
    let items = [];

    // Import Race
    const race = await findRace(data.race?.name);
    if (race) {
        items.push(race);
    }

    // Import Theme
    const theme = await findTheme(data.theme?.name);
    if (theme) {
        items.push(theme);
    }

    // Import Classes
    let classes = [];
    for (const currentClass of data.classes) {
        const compendiumClass = await findClass(currentClass.name);
        // TODO: Class features
        // TODO: Archetype
        if (compendiumClass) {
            compendiumClass.data.levels = currentClass.levels;
            classes.push(compendiumClass);
        }
    }

    items.push(...classes);

    // Import Feats
    let feats = [];
    for (const currentFeat of data.feats.acquiredFeats) {
        // TODO: Feat option selection
        const compendiumFeat = await findFeat(currentFeat.name, currentFeat.isCombatFeat);
        if (compendiumFeat) {
            feats.push(compendiumFeat);
        }
    }

    items.push(...feats);

    // Import Equipment
    let equipment = [];
    for (const currentEquipment of data.inventory) {
        // TODO: Item option selection
        // TODO: isEquipped
        const compendiumEquipment = await findEquipment(currentEquipment.name);
        if (compendiumEquipment) {
            equipment.push(compendiumEquipment);
        }
    }

    items.push(...equipment);

    // Import Spells
    let spells = [];
    for (const currentClass of data.classes) {
        for (const spell of currentClass.spells) {
            let spellLevel = undefined;
            for (const level in spell.level) {
                if (level.class === currentClass.name) {
                    spellLevel = level.level;
                    break;
                }
            }

            if (spellLevel === undefined && spell.level) {
                spellLevel = spell.level[0].level;
            }

            const compendiumSpell = await findSpell(spell.name);
            if (compendiumSpell) {
                compendiumSpell.data.level = spellLevel;
                spells.push(compendiumSpell);
            }
        }
    }

    items.push(...spells);

    // TODO: Conditions
    // TODO: Afflictions

    // Create Actor
    let actor = await Actor.create({
        name: data.name,
        type: 'character',
        data: {
            abilities: importAbilities(data.abilityScores),
            skills: importSkills(data.skills),
        },
        items: items,
    });
    
    await addAbilityIncreases(actor, data.abilityScores.increases);
}

function importAbilities(abilityScores) {
    return {
        str: importAbility(abilityScores.strength),
        dex: importAbility(abilityScores.dexterity),
        con: importAbility(abilityScores.constitution),
        int: importAbility(abilityScores.intelligence),
        wis: importAbility(abilityScores.wisdom),
        cha: importAbility(abilityScores.charisma),
    }
}

function importAbility(ability) {
    let base = 10;
    if (ability.base) {
        base = ability.base;
    } else {
        base += ability.pointBuy;
    }

    let damage = null;
    if (ability.damage) {
        damage = ability.damage;
    }

    return {
        value: 10,
        min: 3,
        misc: 0,
        mod: 0,
        base: base,
        damage: damage,
        userPenalty: undefined,
        drain: undefined,
    }
}

function importSkills(skills) {
    let importedSkills = {};
    let professionIndex = 0;
    for(const skill of skills) {
        let name = skill.skill.substring(0, 3).toLowerCase();
        if (skill.skill === 'Life Science') {
            name = 'lsc';
        } else if (skill.skill === 'Physical Science') {
            name = 'phs';
        } else if (skill.skill === 'Profession') {
            if (professionIndex > 0) {
                name += professionIndex.toString();
            }
            professionIndex++;
        }

        let subname = '';
        if (skill.skill === 'Profession') {
            subname = skill.name;
        }

        const ability = skill.ability.substring(0, 3).toLowerCase();

        importedSkills[name] = {
            ability: ability,
            min: 0,
            ranks: skill.ranks,
            value: 0,
            misc: 0,
            mod: 0,
            subname: subname,
            isTrainedOnly: skill.trainedOnly,
            enabled: skill.classSkill,
        };
    }

    return importedSkills;
}

async function addAbilityIncreases(actor, increases) {
    for (let i = 0; i < increases.length; i++) {
        const name = `Ability Score Increase: Level ${(i + 1) * 5}`;
        const increase = increases[i];
        const data = {
            abilities: {
                str: increase.find(a => a === 'strength') !== undefined,
                dex: increase.find(a => a === 'dexterity') !== undefined,
                con: increase.find(a => a === 'constitution') !== undefined,
                wis: increase.find(a => a === 'wisdom') !== undefined,
                int: increase.find(a => a === 'intelligence') !== undefined,
                cha: increase.find(a => a === 'charisma') !== undefined,
            }
        };

        await actor.createOwnedItem({
            name: name,
            type: 'asi',
            data: data,
        });
    }
}
