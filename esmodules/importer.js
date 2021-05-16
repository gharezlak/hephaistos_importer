import { findRace, findTheme, findClass, findFeat, findEquipment, findSpell, findClassFeature, findStarshipComponent } from './compendium.js';
import { parseEffect } from './effect-parser.js';
import { HephaistosMissingItemsDialog } from './missing-items-dialog.js';

export async function importJson(data) {
    if (!data?.version?.minor && !data?.version?.major) {
        throw new Error("Incorrect data format. Please ensure that you are using the JSON file download from the Hephaistos website.");
    }

    if (data.type === 'starship') {
        await importStarship(data);
    } else {
        let character = await importCharacter(data);
        if (data.drone) {
            try {
                await importDrone(data.drone);
            } catch (e) {
                await character.delete();
                throw e;
            }
        }
    }
}

async function importStarship(data) {
    let items = [];
    let notFound = [];

    const findComponent = async (name, subtitle, after) => {
        if (!name) {
            return;
        }

        const res = await findStarshipComponent(name);

        if (res?.exact) {
            if (after) {
                await after(res.value);
            }

            items.push(res.value);
        } else {
            notFound.push({
                name: name, 
                subtitle: subtitle,
                compendium: res?.value,
                find: (x) => findStarshipComponent(x),
                after: after,
            });
        }
    };

    await findComponent(data.baseFrame?.name, 'Base Frame');
    for (const pc of data.powerCores) {
        await findComponent(pc.name, 'Power Core');
    }
    await findComponent(data.thruster?.name, 'Thruster');
    await findComponent(data.armor?.name, 'Armor');
    await findComponent(data.ablativeArmor?.name, 'Ablative Armor');
    await findComponent(data.fortifiedHull?.name, 'Fortified Hull');
    await findComponent(data.reinforcedBulkhead?.name, 'Reinforced Bulkhead');
    await findComponent(data.shield?.name, 'Shield');
    await findComponent(data.computer?.name, 'Computer');
    await findComponent(data.crewQuarter?.name, 'Crew Quarter');
    await findComponent(data.defensiveCountermeasure?.name, 'Defensive Countermeasure');
    await findComponent(data.interstellarDrive?.name, 'Interstellar Drive');
    await findComponent(data.sensor?.name, 'Sensor');
    for (const eb of data.expansionBays) {
        await findComponent(eb.name, 'Expansion Bay');
    }
    for (const w of data.weapons) {
        const after = (weapon) => {
            if (w.installedArc) {
                weapon.data.mount = {
                    mounted: true,
                    arc: w.installedArc.toLowerCase(),
                }
            }
        };

        await findComponent(w.name, 'Weapon', after);
    }
    
    // Deal with the items that weren't found
    if (notFound.length !== 0) {
        let resolved = await resolveNotFound(notFound);
        if (resolved) {
            items.push(...resolved);
        }
    }

    let starshipData = {
        name: data.name,
        type: 'starship',
        data: {
            details: {
                tier: data.tier,
            },
            attributes: {
                systems: {
                    weaponsArrayForward: importStarshipSystem(data.arcs?.forward?.condition),
                    weaponsArrayPort: importStarshipSystem(data.arcs?.port?.condition),
                    weaponsArrayStarboard: importStarshipSystem(data.arcs?.starboard?.condition),
                    weaponsArrayAft: importStarshipSystem(data.arcs?.aft?.condition),
                    lifeSupport: importStarshipSystem(data.condition?.lifeSupport),
                    sensors: importStarshipSystem(data.condition?.sensors),
                    engines: importStarshipSystem(data.condition?.engines),
                    powerCore: importStarshipSystem(data.condition?.powerCore),
                },
            }
        },
    };

    // Create Actor
    let actor = await Actor.create(starshipData);

    for (const i of items) {
        i['_id'] = undefined;
        await actor.createOwnedItem(i);
    }
}

async function importCharacter(data) {
    let items = [];
    let notFound = [];

    // Import Race
    const race = await findRace(data.race, data.race.abilityAdjustment.name);
    if (race) {
        const after = (r) => {
            // Special case handling of races like Humans, Half-orcs and Half-elves who
            // can choose the ability score their racial bonus applies to.
            if (data.race.abilityAdjustment?.name?.startsWith('Standard (')) {
                r.data.abilityMods.parts = [];
                for (const adj of data.race.abilityAdjustment.adjustment) {
                    const split = adj.split(' ');
                    const value = parseInt(split[0]);
                    const ability = split[1];

                    r.data.abilityMods.parts.push([value, ability]);
                }
            }
        }

        if (race.exact) {
            after(race.value);
            items.push(race.value);
        } else {
            notFound.push({name: race.query, subtitle: 'Race', compendium: race.value, find: (x) => findRace(x), after: after});
        }
    } else if (data.race) {
        notFound.push({name: race.query, subtitle: 'Race', find: (x) => findRace(x), after: after});
    }

    // Import Theme
    const theme = await findTheme(data.theme?.name);
    if (theme) {
        if (theme.exact) {
            items.push(theme.value);
        } else {
            notFound.push({name: data.theme.name, subtitle: 'Theme', compendium: theme.value, find: (x) => findTheme(x)});
        }
    } else if (data.theme) {
        notFound.push({name: data.theme.name, subtitle: 'Theme', find: (x) => findTheme(x)});
    }

    // Import Classes
    for (const currentClass of data.classes) {
        const after = async (x) =>  {
            x.data.levels = currentClass.levels;
        }

        const compendiumClass = await findClass(currentClass.name);
        // TODO: Archetype
        if (compendiumClass?.exact) {
            await after(compendiumClass.value);
            items.push(compendiumClass.value);
        } else {
            notFound.push({
                name: currentClass.name, 
                subtitle: `Class`,
                compendium: compendiumClass?.value,
                find: (x) => findClass(x),
                after: after,
            });
        }

        // Class features
        for (const currentFeature of currentClass.features) {
            let featureResult = await importClassFeature(currentClass.name, currentFeature);
            items.push(...featureResult.items);
            notFound.push(...featureResult.notFound);

            for (const opt of currentFeature.options) {
                let optionResult = await importClassFeature(currentClass.name, opt);
                items.push(...optionResult.items);
                notFound.push(...optionResult.notFound);
            }
        }
    }

    // Import Equipment
    let equipmentResult = await importEquipment(data.inventory);
    items.push(...equipmentResult.items);
    notFound.push(...equipmentResult.notFound);

    // Import Spells
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
            const after = async (x) => x.data.level = spellLevel;

            const compendiumSpell = await findSpell(spell.name);
            if (compendiumSpell?.exact) {
                await after(compendiumSpell.value);
                items.push(compendiumSpell.value);
            } else {
                notFound.push({
                    name: spell.name, 
                    subtitle: 'Spell',
                    compendium: compendiumSpell?.value,
                    find: (x) => findSpell(x),
                    after: after,
                });
            }
        }
    }

    // TODO: Afflictions
    let characterData = {
        name: data.name,
        type: 'character',
        data: {
            abilities: importAbilities(data.abilityScores),
            skills: importSkills(data.skills),
            conditions: importConditions(data.conditions),
            spells: importSpellsPerDay(data.classes),
            currency: {
                credit: data.credits,
            },
            traits: {
                size: data.race?.size.toLowerCase(),
            },
            attributes: {
                keyability: calculateKeyAbility(data.classes),
                speed: importSpeed(data.speed),
            },
        },
    };

    // Import Feats
    let featResult = await importFeats(data.feats.acquiredFeats, characterData);
    items.push(...featResult.items);
    notFound.push(...featResult.notFound);

    // Deal with the items that weren't found
    if (notFound.length !== 0) {
        let resolved = await resolveNotFound(notFound);
        if (resolved) {
            items.push(...resolved);
        }
    }

    // Create Actor
    let actor = await Actor.create(characterData);

    for (const i of items) {
        i['_id'] = undefined;
        await actor.createOwnedItem(i);
    }
    
    await addAbilityIncreases(actor, data.abilityScores.increases);
    return actor;
}

async function importDrone(data) {
    let items = [];
    let notFound = [];

    // Import Race
    if (data.chassis) {
        const chassis = await findClassFeature(data.chassis.name);
        if (chassis) {
            const after = (c) => {
                c.data.levels = data.level;
            }
    
            if (chassis.exact) {
                after(chassis.value);
                items.push(chassis.value);
            } else {
                notFound.push({name: chassis.query, subtitle: 'Drone Chassis', compendium: chassis.value, find: (x) => findClassFeature(x), after: after});
            }
        } else if (data.race) {
            notFound.push({name: chassis.query, subtitle: 'Drone Chassis', find: (x) => findClassFeature(x), after: after});
        }
    }
    
    // Import Special Abilities
    for (const ability of data.specialAbilities) {
        let abilityResult = await importClassFeature('Drone Special Ability', ability);
        items.push(...abilityResult.items);
        notFound.push(...abilityResult.notFound);
    }

    // Import Drone Mods
    for (const mod of data.mods.installedMods) {
        let modResult = await importClassFeature('Drone Mod', mod);
        items.push(...modResult.items);
        notFound.push(...modResult.notFound);
    }

    // Import Equipment
    let equipmentResult = await importEquipment(data.inventory);
    items.push(...equipmentResult.items);
    notFound.push(...equipmentResult.notFound);

    let droneData = {
        name: data.name,
        type: 'drone',
        data: {
            abilities: importAbilities(data.abilityScores),
            skills: importSkills(data.skills),
            conditions: importConditions(data.conditions),
            currency: {
                credit: data.credits,
            },
            traits: {
                size: data.chassis?.size.toLowerCase(),

            },
            attributes: {
                speed: importSpeed(data.speed),
            },
        },
    };

    // Import Feats
    let featResult = await importFeats(data.feats.acquiredFeats, droneData);
    items.push(...featResult.items);
    notFound.push(...featResult.notFound);
    
    // Deal with the items that weren't found
    if (notFound.length !== 0) {
        let resolved = await resolveNotFound(notFound);
        if (resolved) {
            items.push(...resolved);
        }
    }

    // Create Actor
    let actor = await Actor.create(droneData);

    for (const i of items) {
        i['_id'] = undefined;
        await actor.createOwnedItem(i);
    }
    
    return actor;
}

async function resolveNotFound(notFound) {
    let items = [];

    const uniqueNotFound = new Map();
    for (const nf of notFound) {
        uniqueNotFound.set(nf.name, nf);
    }

    const replacedItems = await HephaistosMissingItemsDialog.createAndShow([...uniqueNotFound.values()]);
    if (!replacedItems) {
        return;
    }

    for(const ri of replacedItems) {
        if (!ri.compendium) {
            continue;
        }

        const repeats = notFound.reduce((n, x) => n + (x.name === ri.name), 0);
        if (typeof ri.compendium === 'string') {
            let found = await ri.find(ri.compendium);
            if (!found) {
                continue;
            }

            for(let i = 0; i < repeats; i++) {
                if (ri.after) {
                    await ri.after(found.value);
                }
                items.push(found.value);
            }
        } else {
            for(let i = 0; i < repeats; i++) {
                if (ri.after) {
                    await ri.after(ri.compendium);
                }
                items.push(ri.compendium);
            }
        }
    }

    return items;
}

function importStarshipSystem(condition) {
    if (!condition || condition === 'Normal') {
        return undefined;
    }

    return {
        value: condition.toLowerCase(),
    };
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

function importSpeed(speed) {
    const value = `${speed.land} ft.`;
    const other = [];

    if (speed.burrow) {
        other.push(`burrow ${speed.burrow} ft.`);
    }
    if (speed.swim) {
        other.push(`swim ${speed.swim} ft.`);
    }
    if (speed.climb) {
        other.push(`climb ${speed.climb} ft.`);
    }
    if (speed.flyClumsy) {
        other.push(`fly (clumsy) ${speed.flyClumsy} ft.`);
    }
    if (speed.flyAverage) {
        other.push(`fly (average) ${speed.flyAverage} ft.`);
    }
    if (speed.flyPerfect) {
        other.push(`fly (perfect) ${speed.flyPerfect} ft.`);
    }

    return {
        value: value,
        special: other.join(', '),
    };
}

function calculateKeyAbility(classes) {
    if (!classes) {
        return undefined;
    }

    if (classes.length === 1) {
        return classes[0].keyAbility.toLowerCase().substring(0, 3);
    }

    // else find the most "popular" key ability
    let keyAbilities = new Map();
    for(const c of classes) {
        if (keyAbilities.has(c.keyAbility)) {
            keyAbilities.set(c.keyAbility, keyAbilities.get(c.keyAbility) + c.levels);
        } else {
            keyAbilities.set(c.keyAbility, c.levels);
        }
    }

    const keyAbility = [...keyAbilities.entries()].sort((a, b) => b[1] - a[1])[0][0];
    return keyAbility.toLowerCase().substring(0, 3);
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

async function importEquipment(inventory) {
    let items = [];
    let notFound = [];

    for (const currentEquipment of inventory) {
        const after = async (x) => {
            x.data.equipped = currentEquipment.isEquipped;

            if (x?.data?.container?.contents) {
                x.data.container.contents = [];
                await addEnhancements(x, currentEquipment.fusionIds, inventory);
                await addEnhancements(x, currentEquipment.accessoryIds, inventory);
                await addEnhancements(x, currentEquipment.upgradeIds, inventory);
            }
        };

        // TODO: Item option selection
        const compendiumEquipment = await findEquipment(currentEquipment.name);
        if (compendiumEquipment?.exact) {
            await after(compendiumEquipment.value);
            items.push(compendiumEquipment.value);
        } else {
            notFound.push({
                name: currentEquipment.name, 
                subtitle: 'Equipment',
                compendium: compendiumEquipment?.value,
                find: (x) => findEquipment(x),
                after: after,
            });
        }
    }

    return {items: items, notFound: notFound};
}

async function importFeats(feats, actorData) {
    let items = [];
    let notFound = [];

    for (const currentFeat of feats) {
        const parseEffects = async (name, effects) => {
            let mod = [];
            for (const e of effects) {
                let res = await parseEffect(actorData, name, e);
                if (res) {
                    mod.push(res);
                }
            }

            return mod;
        };

        const after = async (x) => {
            let modifiers = []
            if (currentFeat.benefitEffect) {
                let mods = await parseEffects(currentFeat.name, currentFeat.benefitEffect);
                modifiers.push(...mods);
            }

            if (currentFeat.selectedOptions) {
                for (const so of currentFeat.selectedOptions) {
                    if (so.effect) {
                        let mods = await parseEffects(`${currentFeat.name} (${so.name})`, so.effect);
                        modifiers.push(...mods);
                    }
                }
            }

            x.data.modifiers = modifiers;
        };

        // TODO: Feat option selection
        const compendiumFeat = await findFeat(currentFeat.name, currentFeat.isCombatFeat);
        if (compendiumFeat?.exact) {
            await after(compendiumFeat.value);
            items.push(compendiumFeat.value);
        } else {
            notFound.push({
                name: currentFeat.name, 
                subtitle: 'Feat',
                compendium: compendiumFeat?.value,
                find: (x) => findFeat(x),
                after: after,
            });
        }
    }

    return {items: items, notFound: notFound};
}

async function importClassFeature(subtitle, classFeature) {
    let items = [];
    let notFound = [];

    const compendiumFeature = await findClassFeature(classFeature.name);
    if (compendiumFeature?.exact) {
        items.push(compendiumFeature.value);
    } else {
        notFound.push({
            name: classFeature.name, 
            subtitle: `Class Feature (${subtitle})`,
            compendium: compendiumFeature?.value,
            find: (x) => findClassFeature(x),
        });
    }
    
    return {items: items, notFound: notFound};
}