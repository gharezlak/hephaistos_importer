import { findRace, findTheme, findClass, findFeat, findEquipment, findSpell } from './compendium.js';

export async function importJson(data) {
    let items = [];

    // Import Race
    const race = await findRace(data.race);
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
        const compendiumEquipment = await findEquipment(currentEquipment.name);
        if (compendiumEquipment) {
            compendiumEquipment.data.equipped = currentEquipment.isEquipped;

            if (compendiumEquipment?.data?.container?.contents) {
                compendiumEquipment.data.container.contents = [];
                await addEnhancements(compendiumEquipment, currentEquipment.fusionIds, data.inventory);
                await addEnhancements(compendiumEquipment, currentEquipment.accessoryIds, data.inventory);
                await addEnhancements(compendiumEquipment, currentEquipment.upgradeIds, data.inventory);
            }

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

    // TODO: Afflictions

    // Create Actor
    let actor = await Actor.create({
        name: data.name,
        type: 'character',
        data: {
            abilities: importAbilities(data.abilityScores),
            skills: importSkills(data.skills),
            conditions: importConditions(data.conditions),
            spells: importSpellsPerDay(data.classes),
            currency: {
                credit: data.credits,
            }
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

function importConditions(conditions) {
    return {
        "asleep": conditions.asleep.active,
        "bleeding": conditions.bleeding.active,
        "blinded": conditions.blinded.active,
        "broken": conditions.broken.active,
        "burning": conditions.burning.active,
        "confused": conditions.confused.active,
        "cowering": conditions.cowering.active,
        "dazed": conditions.dazed.active,
        "dazzled": conditions.dazzled.active,
        "dead": conditions.dead.active,
        "deafened": conditions.deafened.active,
        "dying": conditions.dying.active,
        "encumbered": conditions.encumbered.active,
        "entangled": conditions.entangled.active,
        "exhausted": conditions.exhausted.active,
        "fascinated": conditions.fascinated.active,
        "fatigued": conditions.fatigued.active,
        "flat-footed": conditions.flatFooted.active,
        "frightened": conditions.frightened.active,
        "grappled": conditions.grappled.active,
        "helpless": conditions.helpless.active,
        "nauseated": conditions.nauseated.active,
        "off-kilter": conditions.offKilter.active,
        "off-target": conditions.offTarget.active,
        "overburdened": conditions.overburdened.active,
        "panicked": conditions.panicked.active,
        "paralyzed": conditions.paralyzed.active,
        "pinned": conditions.pinned.active,
        "prone": conditions.prone.active,
        "shaken": conditions.shaken.active,
        "sickened": conditions.sickened.active,
        "stable": conditions.stable.active,
        "staggered": conditions.staggered.active,
        "stunned": conditions.stunned.active,
        "unconscious": conditions.unconscious.active,
    }
}

function importSpellsPerDay(classes) {
    let spells = {
        spell0: { value: 0, max: 0 },
        spell1: { value: 0, max: 0 },
        spell2: { value: 0, max: 0 },
        spell3: { value: 0, max: 0 },
        spell4: { value: 0, max: 0 },
        spell5: { value: 0, max: 0 },
        spell6: { value: 0, max: 0 },
    }

    for(const currentClass of classes) {
        spells.spell0 = {
            value: (currentClass.spellsUsed?.[0] ?? 0) + spells.spell0.value,
            max: (currentClass.spellsPerDay?.[0] ?? 0) + spells.spell0.max,
        }
        spells.spell1 = {
            value: (currentClass.spellsUsed?.[1] ?? 0) + spells.spell1.value,
            max: (currentClass.spellsPerDay?.[1] ?? 0) + spells.spell1.max,
        }
        spells.spell2 = {
            value: (currentClass.spellsUsed?.[2] ?? 0) + spells.spell2.value,
            max: (currentClass.spellsPerDay?.[2] ?? 0) + spells.spell2.max,
        }
        spells.spell3 = {
            value: (currentClass.spellsUsed?.[3] ?? 0) + spells.spell3.value,
            max: (currentClass.spellsPerDay?.[3] ?? 0) + spells.spell3.max,
        }
        spells.spell4 = {
            value: (currentClass.spellsUsed?.[4] ?? 0) + spells.spell4.value,
            max: (currentClass.spellsPerDay?.[4] ?? 0) + spells.spell4.max,
        }
        spells.spell5 = {
            value: (currentClass.spellsUsed?.[5] ?? 0) + spells.spell5.value,
            max: (currentClass.spellsPerDay?.[5] ?? 0) + spells.spell5.max,
        }
        spells.spell6 = {
            value: (currentClass.spellsUsed?.[6] ?? 0) + spells.spell6.value,
            max: (currentClass.spellsPerDay?.[6] ?? 0) + spells.spell6.max,
        }
    }

    return spells;
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

async function addEnhancements(equipment, enhancementIds, inventory) {
    if (!enhancementIds) {
        return;
    }

    const dataEnhancements = inventory.filter(e => enhancementIds.some(f => f === e.id));
    for(const fusion of dataEnhancements) {
        const compendiumEnhancement = await findEquipment(fusion.name);
        if (compendiumEnhancement) {
            equipment.data.container.contents.push({
                id: compendiumEnhancement._id,
                index: 0,
            });
        }
    }

}