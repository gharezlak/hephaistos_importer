# Hephaistos Importer for Foundry
A FoundryVTT module that allows importing of characters & starships from [Hephaistos](https://hephaistos.azurewebsites.net/).

## Manual Installation
1. Create a folder named `hephaistos-importer` wherever FoundryVTT loads it's modules from (usually `{userData}/Data/modules`).
1. Download and extract the source of this repository into the `hephaistos-importer` folder.

## Use

> Importing characters into FoundryVTT requires you to either have the Game Master role, have the Assistant role, or have the permission to create new Actors.

1. In Hephaistos, open your character and download it as JSON.
1. In FoundryVTT, navigate to the *Actors* tab and click the **Import From Hephaistos** button at the bottom.
1. Select the downloaded JSON file and click **Import**.

## Status
This module is currently a work-in-progress. A summary of the work done, and remaining to be done can be found below:

- [x] Ability Scores
- [x] Skills
- [ ] Races
    - [x] Basic Import
    - [x] Races with alternate ability adjustment
    - [ ] Racial trait options
- [ ] Themes
    - [x] Basic Import
    - [ ] Theme Knowledge selection
- [ ] Classes
    - [x] Basic Import
    - [x] Spells Per Day
    - [x] Class Features
        - [x] Class Feature Options
    - [ ] Archetypes
        - [ ] Basic Import
        - [ ] Class Features
- [ ] Feats
    - [x] Basic Import
    - [x] Feat Option (only for some feats)
- [ ] Equipment
    - [x] Basic Import
    - [x] Is Equipped/Installed
    - [x] Enhancements
        - [x] Weapon Fusions on Weapons & Shields
        - [x] Armor Upgrades on Armor & Shields
        - [x] Weapon Accessories on Weapons
    - [ ] Equipment Options
- [x] Spells
- [x] Conditions
    - [ ] Negative Levels
- [ ] Afflictions
- [ ] Drones
    - [x] Stats
    - [x] Chassis
    - [ ] Mods
        - [x] Basic Import
        - [ ] Skill Unit
    - [x] Equipment
    - [x] Feats
- [x] Starships
