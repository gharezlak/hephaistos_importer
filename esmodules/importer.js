import { findRace, findTheme, findClass, findFeat, findEquipment, findSpell, findClassFeature, findStarshipComponent } from './compendium.js';
import { parseEffect } from './effect-parser.js';
import { HephaistosMissingItemsDialog } from './missing-items-dialog.js';

export async function importJson(data) {
    if (!data?.version?.minor && !data?.version?.major) {
        throw new Error('Incorrect data format. Please ensure that you are using the JSON file download from the Hephaistos website.');
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
        const after = async (weapon) => {
            if (w.installedArc) {
                await weapon.updateSource({'system.mount': {
                    mounted: true,
                    arc: w.installedArc.toLowerCase(),
                }});
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
        system: {
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
    await actor.createEmbeddedDocuments('Item', items.map(i => i._source));
}

async function importCharacter(data) {
    let items = [];
    let notFound = [];

    // Import Race
    const race = await findRace(data.race, data.race?.abilityAdjustment.name);
    if (race) {
        const after = async (r) => {
            // Special case handling of races like Humans, Half-orcs and Half-elves who
            // can choose the ability score their racial bonus applies to.
            if (data.race.abilityAdjustment?.name?.startsWith('Standard (')) {
                let parts = [];
                for (const adj of data.race.abilityAdjustment.adjustment) {
                    const split = adj.split(' ');
                    const value = parseInt(split[0]);
                    const ability = split[1];

                    parts.push([value, ability]);
                }

                await r.updateSource({'system.abilityMods.parts': parts});
            }
        }

        if (race.exact) {
            await after(race.value);
            items.push(race.value);
        } else {
            notFound.push({name: race.query, subtitle: 'Race', compendium: race.value, find: (x) => findRace(x), after: after});
        }
    } else if (data.race) {
        notFound.push({name: race.query, subtitle: 'Race', find: (x) => findRace(x), after: after});
    }

    // Import Theme
    const theme = await findTheme(data.theme?.name);
    const themeAfter = async (t) => {
        if (!data.theme) {
            return;
        }

        const knowledgeOptions = data.theme?.benefits
            .filter(b => b.name.includes('Theme Knowledge') || b.name.includes('General Knowledge'))
            .map(b => b.selectedOptions)
            .filter(x => !!x)
            .flat();

        const ability = knowledgeOptions.map(o => abilityFromString(o.name)).filter(x => !!x)?.[0];
        if (ability) {
            await t.updateSource({'system.abilityMod.ability': ability});
        }

        const skill = knowledgeOptions.map(o => skillFromString(o.name)).filter(x => !!x)?.[0];
        if (skill) {
            await t.updateSource({'system.skill': skill});
        }
    };
    if (theme) {
        if (theme.exact) {
            await themeAfter(theme.value);
            items.push(theme.value);
        } else {
            notFound.push({name: data.theme.name, subtitle: 'Theme', compendium: theme.value, find: (x) => findTheme(x), after: (t) => themeAfter(t)});
        }
    } else if (data.theme) {
        notFound.push({name: data.theme.name, subtitle: 'Theme', find: (x) => findTheme(x), after: (t) => themeAfter(t)});
    }

    // Import Classes
    for (const currentClass of data.classes) {
        const after = async (x) =>  {
            await x.updateSource({'system.levels': currentClass.levels});
            console.warn(x);
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
                let optionResult = await importClassFeature(`${currentClass.name}, ${currentFeature.name}`, opt);
                items.push(...optionResult.items);
                notFound.push(...optionResult.notFound);
            }
        }
    }

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
            const after = async (x) => { await x.updateSource({'system.level': spellLevel}); };

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
        system: {
            abilities: importAbilities(data.abilityScores),
            skills: importSkills(data.skills),
            conditions: importConditions(data.conditions),
            spells: importSpellsPerDay(data.classes),
            currency: {
                credit: data.credits,
            },
            traits: {
                size: data.race?.size.toLowerCase(),
                senses: data.senses?.map(s => {
                    let name = s.senseType;
                    if (s.additionalInfo) {
                        name += ` (${s.additionalInfo})`;
                    }

                    if (s.range) {
                        name += ` ${s.range} ft.`;
                    }
                    return name;
                }).join(", ")
            },
            attributes: {
                keyability: calculateKeyAbility(data.classes),
                speed: importSpeed(data.speed),
            },
        },
    };

    // Import Equipment
    let equipmentResult = await importEquipment(data.inventory, characterData);
    items.push(...equipmentResult.items);
    notFound.push(...equipmentResult.notFound);

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
    await actor.createEmbeddedDocuments('Item', items.map(i => i._source));

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
            const after = async (c) => {
                await c.updateSource({'system.levels': data.level});
            }

            if (chassis.exact) {
                await after(chassis.value);
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
        system: {
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
    await actor.createEmbeddedDocuments('Item', items.map(i => i._source));

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
        return { value: 'nominal' };
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

function abilityFromString(str) {
    if (!str) {
        return undefined;
    }

    if (str.toLowerCase().includes('strength')) {
        return 'str';
    } else if (str.toLowerCase().includes('dexterity')) {
        return 'dex';
    } else if (str.toLowerCase().includes('constitution')) {
        return 'con';
    } else if (str.toLowerCase().includes('intelligence')) {
        return 'int';
    } else if (str.toLowerCase().includes('wisdom')) {
        return 'wis';
    } else if (str.toLowerCase().includes('charisma')) {
        return 'cha';
    }

    return undefined;
}

function skillFromString(str) {
    if (!str) {
        return undefined;
    }

    if (str.toLowerCase().includes('athletics')) {
        return 'ath';
    }
    else if (str.toLowerCase().includes('acrobatics')) {
        return 'acr';
    }
    else if (str.toLowerCase().includes('bluff')) {
        return 'blu';
    }
    else if (str.toLowerCase().includes('computers')) {
        return 'com';
    }
    else if (str.toLowerCase().includes('culture')) {
        return 'cul';
    }
    else if (str.toLowerCase().includes('diplomacy')) {
        return 'dip';
    }
    else if (str.toLowerCase().includes('disguise')) {
        return 'dis';
    }
    else if (str.toLowerCase().includes('engineering')) {
        return 'eng';
    }
    else if (str.toLowerCase().includes('intimidate')) {
        return 'int';
    }
    else if (str.toLowerCase().includes('life Science')) {
        return 'lsc';
    }
    else if (str.toLowerCase().includes('medicine')) {
        return 'med';
    }
    else if (str.toLowerCase().includes('mysticism')) {
        return 'mys';
    }
    else if (str.toLowerCase().includes('perception')) {
        return 'per';
    }
    else if (str.toLowerCase().includes('physical Science')) {
        return 'phs';
    }
    else if (str.toLowerCase().includes('piloting')) {
        return 'pil';
    }
    else if (str.toLowerCase().includes('profession')) {
        return 'pro';
    }
    else if (str.toLowerCase().includes('sense motive')) {
        return 'sen';
    }
    else if (str.toLowerCase().includes('sleight of hand')) {
        return 'sle';
    }
    else if (str.toLowerCase().includes('stealth')) {
        return 'ste';
    }
    else if (str.toLowerCase().includes('survival')) {
        return 'sur';
    }

    return undefined;
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
    if (!classes || classes.length === 0) {
        return undefined;
    }

    if (classes.length === 1) {
        return classes[0].keyAbility.toLowerCase().substring(0, 3);
    }

    // else find the most 'popular' key ability
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
    } else if (ability.override) {
        base = ability.override - ability.scoreBonuses?.map(sb => sb.value).reduce((p, c) => p + c, 0);
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
            value: skill.classSkill ? 3 : 9,
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
        'asleep': conditions.asleep.active,
        'bleeding': conditions.bleeding.active,
        'blinded': conditions.blinded.active,
        'broken': conditions.broken.active,
        'burning': conditions.burning.active,
        'confused': conditions.confused.active,
        'cowering': conditions.cowering.active,
        'dazed': conditions.dazed.active,
        'dazzled': conditions.dazzled.active,
        'dead': conditions.dead.active,
        'deafened': conditions.deafened.active,
        'dying': conditions.dying.active,
        'encumbered': conditions.encumbered.active,
        'entangled': conditions.entangled.active,
        'exhausted': conditions.exhausted.active,
        'fascinated': conditions.fascinated.active,
        'fatigued': conditions.fatigued.active,
        'flat-footed': conditions.flatFooted.active,
        'frightened': conditions.frightened.active,
        'grappled': conditions.grappled.active,
        'helpless': conditions.helpless.active,
        'nauseated': conditions.nauseated.active,
        'off-kilter': conditions.offKilter.active,
        'off-target': conditions.offTarget.active,
        'overburdened': conditions.overburdened.active,
        'panicked': conditions.panicked.active,
        'paralyzed': conditions.paralyzed.active,
        'pinned': conditions.pinned.active,
        'prone': conditions.prone.active,
        'shaken': conditions.shaken.active,
        'sickened': conditions.sickened.active,
        'stable': conditions.stable.active,
        'staggered': conditions.staggered.active,
        'stunned': conditions.stunned.active,
        'unconscious': conditions.unconscious.active,
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

        await actor.createEmbeddedDocuments('Item', [{
            name: name,
            type: 'asi',
            system: data,
        }]);
    }
}

async function addEnhancements(enhancementIds, inventory) {
    if (!enhancementIds) {
        return [];
    }

    const dataEnhancements = inventory.filter(e => enhancementIds.some(f => f === e.id));
    let enhancement = [];
    for(const fusion of dataEnhancements) {
        const compendiumEnhancement = await findEquipment(fusion.name);
        if (compendiumEnhancement) {
            enhancement.push({
                id: compendiumEnhancement._id,
                index: 0,
            });
        }
    }
    return enhancement;
}

async function importEquipment(inventory, actorData) {
    let items = [];
    let notFound = [];

    for (const currentEquipment of inventory) {
        const after = async (item, x) => {
            await x.updateSource({'system.equipped': currentEquipment.isEquipped});

            let contents = [];
            contents.push(...await addEnhancements(currentEquipment.fusionIds, inventory));
            contents.push(...await addEnhancements(currentEquipment.accessoryIds, inventory));
            contents.push(...await addEnhancements(currentEquipment.upgradeIds, inventory));
            await x.updateSource({'system.container.contents': contents});

            let modifiers = [];
            if (item.effect) {
                let mods = await parseEffects(actorData, item.name, item.effect);
                modifiers.push(...mods);
            }

            if (item.selectedOptions) {
                for (const so of item.selectedOptions) {
                    if (so.effect) {
                        let mods = await parseEffects(actorData, `${item.name} (${so.name})`, so.effect);
                        modifiers.push(...mods);
                    }
                }
            }

            if (modifiers.length > 0) {
                await x.updateSource({'system.modifiers': modifiers});
            }
        };

        // TODO: Item option selection
        const compendiumEquipment = await findEquipment(currentEquipment.name);
        if (compendiumEquipment?.exact) {
            await after(currentEquipment, compendiumEquipment.value);
            items.push(compendiumEquipment.value);
        } else {
            notFound.push({
                name: currentEquipment.name,
                subtitle: 'Equipment',
                compendium: compendiumEquipment?.value,
                find: (x) => findEquipment(x),
                after: async (x) => await after(currentEquipment, x),
            });
        }
    }

    return {items: items, notFound: notFound};
}

const parseEffects = async (actorData, name, effects) => {
    let mod = [];
    for (const e of effects) {
        let res = await parseEffect(actorData, name, e);
        if (res) {
            mod.push(res);
        }
    }

    return mod;
};

async function importFeats(feats, actorData) {
    let items = [];
    let notFound = [];

    const after = async (feat, x) => {
        let modifiers = []
        if (feat.benefitEffect) {
            let mods = await parseEffects(actorData, feat.name, feat.benefitEffect);
            modifiers.push(...mods);
        }

        if (feat.selectedOptions) {
            for (const so of feat.selectedOptions) {
                if (so.effect) {
                    let mods = await parseEffects(actorData, `${feat.name} (${so.name})`, so.effect);
                    modifiers.push(...mods);
                }
            }
        }

        if (modifiers.length > 0) {
            await x.updateSource({'system.modifiers': modifiers});
        }
    };

    for (const currentFeat of feats) {
        // TODO: Feat option selection
        const compendiumFeat = await findFeat(currentFeat.name, currentFeat.isCombatFeat);
        if (compendiumFeat?.exact) {
            await after(currentFeat, compendiumFeat.value);
            items.push(compendiumFeat.value);
        } else {
            notFound.push({
                name: currentFeat.name,
                subtitle: 'Feat',
                compendium: compendiumFeat?.value,
                find: (x) => findFeat(x),
                after: async (x) => await after(currentFeat, x),
            });
        }
    }

    return {items: items, notFound: notFound};
}

async function importClassFeature(subtitle, classFeature) {
    const specialCases = [
        {
            name: 'Weapon Specialization',
            replacement: undefined,
        },
        {
            name: 'Shield Proficiency',
            replacement: undefined,
        },
        {
            name: 'Heavy Weapon & Heavy Armor Proficiency',
            replacement: undefined,
        },
        {
            name: 'Primary Fighting Style',
            replacement: 'Fighting Style',
        },
        {
            name: 'Primary Fighting Technique',
            replacement: 'Primary Style Technique',
        },
        {
            name: 'Secondary Fighting Style',
            replacement: 'Fighting Style',
        },
        {
            name: 'Secondary Fighting Technique',
            replacement: 'Secondary Style Technique',
        },
    ];

    let classFeatureName = classFeature.name;

    const specialCase = specialCases.find(sc => classFeatureName.startsWith(sc.name));
    if (specialCase) {
        if (specialCase.replacement) {
            classFeatureName = specialCase.replacement;
        } else {
            return { items: [], notFound: [] };
        }
    }

    let items = [];
    let notFound = [];

    const compendiumFeature = await findClassFeature(classFeatureName);
    if (compendiumFeature?.exact) {
        items.push(compendiumFeature.value);
    } else {
        notFound.push({
            name: classFeatureName,
            subtitle: `Class Feature (${subtitle})`,
            compendium: compendiumFeature?.value,
            find: (x) => findClassFeature(x),
        });
    }

    return {items: items, notFound: notFound};
}
