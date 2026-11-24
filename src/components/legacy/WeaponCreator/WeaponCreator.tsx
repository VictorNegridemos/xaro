'use client'

import styles from "./WeaponCreator.module.scss";

import { useState, type ChangeEvent } from "react";

import Button from "../Button/Button";

export default function WeaponCreator() {
    const [proficiency, setProficiency] = useState<keyof typeof weaponStyles>('simpleMelee1h');
    const [style, setStyle] = useState('Club');
    const [specialization, setSpecialization] = useState('Heavy');
    const [type, setType] = useState('Laser');
    const [smart, setSmart] = useState(false);

    // Form generation
    const displayWeaponStyles = () => {
        return (
            weaponStyles[proficiency].map(style => {
                return <option key={style} value={style}>{style}</option>
            })
        )
    }
    const changeSpecialization = (event: ChangeEvent<HTMLSelectElement>) => {
        setSpecialization(event.target.value);
        if(event.target.value === 'Devouring') {
            setType('Devouring');
            setSmart(false);
        } else if (type === 'Devouring') {
            setType('Laser');
        }
    }
    const changeType = (event: ChangeEvent<HTMLSelectElement>) => {
        setType(event.target.value);
        if(event.target.value === 'Devouring') {
            setSpecialization('Devouring');
            setSmart(false);
        }
    }
    const generateWeaponTypeClasses = () => {
        return specialization === 'Devouring' ? styles.disabledSelect : '';
    };
    const generateSmartClasses = () => {
        return specialization === 'Devouring' ? styles.disabledCheckbox : '';
    };

    // Result generation
    const displayAttackBonus = () => {
        if(type === 'Laser') {
            if(proficiency === 'martialRanged2h' || proficiency === 'martialMelee2h') {
                return '3 +';
            } else {
                return '2 +';
            }
        }
    }
    const displayRelevantAttribute = () => {
        return Object.keys(weaponSpecializations).find(key => (weaponSpecializations as Record<string, string>)[key] === specialization)
    }
    const displayDamageType = () => {
        return Object.keys(weaponTypes).find(key => (weaponTypes as Record<string, string>)[key] === type)
    }
    const displayTotalAmmo = () => {
        if(proficiency === 'martialRanged2h' && specialization !== 'Devouring') {
            return '11';
        } else if ((proficiency === 'martialRanged1h' || proficiency === 'simpleRanged1h') && specialization !== 'Devouring') {
            return '9'
        } else {
            return 'unlimited';
        }
    }
    const displayClipAmmo = () => {
        const clipSize = getClipSize();
        return clipSize === 'unlimited' ? 'unlimited' : `reload after ${clipSize} uses`;
    }
    const getClipSize = () => {
        let clipSize = '';

        if((proficiency === 'simpleRanged1h' || proficiency === 'martialRanged1h') && specialization !== 'Devouring') {
            if(type === 'Gravity') {
                clipSize = '3';
            } else if (type === 'Tesla' || type === 'Toxic') {
                clipSize = '4';
            } else if (type === 'Laser' || type === 'Plasma' || type === 'Kinetic' || type === 'Cryogenic' || type === 'Acidic') {
                clipSize = '5';
            } else if (type === 'Radiation' || type === 'Sonic') {
                clipSize = '6';
            }
        } else if(proficiency === 'martialRanged2h' && specialization !== 'Devouring') {
            if(type === 'Gravity') {
                clipSize = '4';
            } else if (type === 'Tesla' || type === 'Toxic') {
                clipSize = '5';
            } else if (type === 'Laser' || type === 'Plasma' || type === 'Kinetic' || type === 'Cryogenic' || type === 'Acidic') {
                clipSize = '6';
            } else if (type === 'Radiation' || type === 'Sonic') {
                clipSize = '7';
            }
        } else {
            clipSize = 'unlimited';
        }

        return clipSize;
    }
    const displayRange = () => {
        if(proficiency === 'martialRanged2h') {
            return '150/600';
        } else if (proficiency === 'simpleRanged1h' || proficiency === 'martialRanged1h') {
            return '30/60';
        } else if (proficiency === 'martialMelee2h') {
            return '10';
        } else {
            return '5';
        }
    }
    const displayWeaponDamage = () => {
        const damage = getWeaponDamage();
        
        if(smart) {
            return damage;
        } else {
            return `${damage} + ${displayRelevantAttribute()} modifier`;
        }
    }
    const getWeaponDamage = () => {
        let damage = '';

        if(proficiency === 'simpleMelee1h') {
            if(specialization === 'Devouring') {
                damage = '2d10 / 1d10';
            } else {
                damage = '1d10';
            }
        } else if(proficiency === 'simpleRanged1h') {
            if(specialization === 'Devouring') {
                damage = '4d4 / 2d4';
            } else {
                damage = '2d4';
            }
        } else if(proficiency === 'martialMelee1h') {
            if(specialization === 'Devouring') {
                damage = '4d10 / 2d10';
            } else if(smart) {
                damage = '3d4';
            } else {
                damage = '2d10';
            }
        } else if(proficiency === 'martialMelee2h') {
            if(specialization === 'Devouring') {
                damage = '6d10 / 3d10';
            } else if(smart) {
                damage = '2d10';
            } else {
                damage = '3d10';
            }
        } else if(proficiency === 'martialRanged1h') {
            if(specialization === 'Devouring') {
                damage = '8d4 / 4d4';
            } else if(smart) {
                damage = '3d4';
            } else {
                damage = '4d4';
            }
        } else if(proficiency === 'martialRanged2h') {
            if(specialization === 'Devouring') {
                damage = '6d6 / 3d6';
            } else if(smart) {
                damage = '4d4';
            } else {
                damage = '3d6';
            }
        }

        return damage;
    }
    const displaySpecialEffect = () => {
        const damageType = Object.keys(weaponTypes).find(key => (weaponTypes as Record<string, string>)[key] === type);
        return (specialEffects as Record<string, string>)[damageType + proficiency.slice(-2)];
    }

    return (
        <div className={styles.mainContainer}>
            <h2>Kodning Weapon Creator</h2>
            <div className={styles.creatorContainer}>
                <div className={styles.selectContainer}>
                    <label>Proficiency</label>
                    <select name="proficiency" value={proficiency} onChange={(e) => setProficiency(e.target.value as keyof typeof weaponStyles)}>
                        {Object.entries(weaponProficiencies).map(([key, value]) => <option key={key} value={key}>{value}</option>)}
                    </select>
                </div>
                <div className={styles.selectContainer}>
                    <label>Weapon style</label>
                    <select name="style" value={style} onChange={(e) => setStyle(e.target.value)}>
                        {displayWeaponStyles()}
                    </select>
                </div>
                <div className={styles.selectContainer}>
                    <label>Specialization</label>
                    <select name="specialization" value={specialization} onChange={changeSpecialization}>
                        {Object.values(weaponSpecializations).map(spec => <option key={spec} value={spec}>{spec}</option>)}
                    </select>
                </div>
                <div className={styles.selectContainer}>
                    <label>Weapon type</label>
                    <select name="type" value={type} onChange={changeType} className={generateWeaponTypeClasses()}>
                        {Object.values(weaponTypes).map(type => <option key={type} value={type}>{type}</option>)}
                    </select>
                </div>
                <div className={styles.checkboxContainer}>
                    <label>Smart</label>
                    <input type="checkbox" name="smart" checked={smart} onChange={(e) => setSmart(!smart)} className={generateSmartClasses()}/>
                </div>
                
                <div className={styles.resultsContainer}>
                    <h3>Result:</h3>
                    <div>
                        <p><span>Attack:</span> {displayAttackBonus()} {displayRelevantAttribute()} modifier + proficiency bonus</p>
                        <p><span>Damage:</span> {displayWeaponDamage()} {displayDamageType()}</p>
                        <p><span>Range:</span> {displayRange()} feet</p>
                        <p><span>Ammo:</span> {displayClipAmmo()}, {displayTotalAmmo()} total ammo</p>
                        <p><span>Special:</span> {displaySpecialEffect()}</p>
                    </div>
                </div>
            </div>
            <Button text={`Back`}/>
        </div>
    );
}

// Weapons data
const weaponProficiencies = {
    simpleMelee1h: 'Simple melee',
    simpleRanged1h: 'Simple ranged',
    martialMelee1h: 'Martial melee one-handed',
    martialMelee2h: 'Martial melee two-handed',
    martialRanged1h: 'Martial ranged one-handed',
    martialRanged2h: 'Martial ranged two-handed',
}
const weaponStyles = {
    simpleMelee1h: ['Club', 'Dagger', 'Handaxe', 'Mace', 'Sickle', 'Spear', 'Hammer', 'Tanto', 'Hatchet'],
    simpleRanged1h: [ 'Pistol'],
    martialMelee1h: ['Flail', 'Straight sword', 'Curved sword', 'Rapier', 'Scimitar', 'Battleaxe', 'War pick', 'Warhammer', 'Whip', 'Trident', 'Morningstar', 'Fist weapon', 'Gladius', 'Wakizashi', 'Saber', 'Claw weapon', 'Shotel'],
    martialMelee2h: ['Greataxe', 'Greatsword', 'Halbert', 'Lance', 'Maul', 'Pike', 'Glaive', 'Claymore', 'Katana', 'Nodachi', 'Twinblade', 'Scythe', 'Yari', 'Naginata', 'Zweihänder', 'Flamberge', 'Falx'],
    martialRanged1h: ['Gun'],
    martialRanged2h: ['Rifle']
};
const weaponSpecializations = {
    strength: 'Heavy',
    dexterity: 'Reflex', 
    intelligence: 'BCI',
    wisdom: 'Precognition',
    charisma: 'Observer effect',
    constitution: 'Devouring'
};
const weaponTypes = {
    radiant: 'Laser',
    fire: 'Plasma',
    piercing: 'Kinetic',
    bludgeoning: 'Gravity',
    cold: 'Cryogenic',
    acid: 'Acidic',
    lightning: 'Tesla',
    thunder: 'Sonic',
    poison: 'Toxic',
    necrotic: 'Radiation',
    physical: 'Devouring'
};
const specialEffects = {
    radiant1h: `When using a weapon with the laser property the attack receives a bonus to it's chance to hit the target due to the incredible speed of the projectile. 
        This bonus is displayed in the 'Attack' section above.`
    ,
    radiant2h: `When using a weapon with the laser property the attack receives a bonus to it's chance to hit the target due to the incredible speed of the projectile. 
        This bonus is displayed in the 'Attack' section above.`
    ,
    fire1h: `When a target takes damage from this weapon it continues burning at the start of each of it's turns for 1d6 fire damage.`,
    fire2h: `When a target takes damage from this weapon it continues burning at the start of each of it's turns for 1d8 fire damage.`,
    piercing1h: `Ignore 2 of the target's AC.`,
    piercing2h: `Ignore 3 of the target's AC.`,
    bludgeoning1h: `Every 2 times a target takes damage from a weapon with this property the one using the weapon chooses to affect it with one of two possible stacking effects:
        - mass reduction - the target's melee attacks deal 1d4 less damage but it's movement speed increases by 5 feet.
        - mass increase  - the target's melee attacks deal an extra 1d4 damage but it's movement speed decreases by 5 feet.
    `,
    bludgeoning2h: `Every 2 times a target takes damage from a weapon with this property the one using the weapon chooses to affect it with one of two possible stacking effects:
        - mass reduction - the target's melee attacks deal 1d6 less damage but it's movement speed increases by 7.5 feet.
        - mass increase  - the target's melee attacks deal an extra 1d6 damage but it's movement speed decreases by 7.5 feet.`
    ,
    cold1h: `An attack roll of 19 or above counts as a critical hit. On a critical hit the target is restrained. At the end of each of it's turns the target makes a DC 14 CON save. 
        On success it removes the restrained condition. If a target restrained by a cryogenic weapon is the target of a critical hit from a cryogenic weapon it is instead petrified.`
    ,
    cold2h: `An attack roll of 19 or above counts as a critical hit. On a critical hit the target is restrained. At the end of each of it's turns the target makes a DC 16 CON save. 
        On success it removes the restrained condition. If a target restrained by a cryogenic weapon is the target of a critical hit from a cryogenic weapon it is instead petrified.`
    ,
    acid1h: `When a target takes damage from this weapon it needs to make a DC 14 WIS save. On a fail the target takes an additional 2d8 psychic damage.`,
    acid2h: `When a target takes damage from this weapon it needs to make a DC 16 WIS save. On a fail the target takes an additional 2d8 psychic damage.`,
    lightning1h: `When a target takes damage from this weapon other targets within 5 feet of the original target also take 2d8 lightning damage. This damage cannot hit the attacker.`,
    lightning2h: `When a target takes damage from this weapon other targets within 5 feet of the original target also take 3d8 lightning damage. This damage cannot hit the attacker.`,
    thunder1h: `When using this weapon the target cannot benefit from cover. When the target takes damage it suffers from the deafened condition and has to make a DC 16 CON save. 
        On failure the target is also proned.`
    ,
    thunder2h: `When using this weapon the target cannot benefit from cover. When the target takes damage it suffers from the deafened condition and has to make a DC 18 CON save. 
        On failure the target is also proned.`
    ,
    poison1h: `When using this weapon instead of targeting a single creature, you target a 5 by 5 feet cube. All creatures within the area become the target of the attack. 
        The toxic cloud generated by the weapon remains in the area and any creature that ends it's turn within it takes 2d6 poison damage.`
    ,
    poison2h: `When using this weapon instead of targeting a single creature, you target a 5 by 5 feet cube. All creatures within the area become the target of the attack. 
        The toxic cloud generated by the weapon remains in the area and any creature that ends it's turn within it takes 3d6 poison damage.`
    ,
    necrotic1h: `When a target takes damage from this weapon it is affected by ACR (acute radiation syndrome). 
        ACR does no additional damage on it's own but most humanoid species will die within 48 hours of exposure. 
        If an attack with this kind of weapon scores a critical hit the target starts vomiting uncontrollably and is affected by the stunned condition. 
        At the end of each of it's turns the target makes a DC 18 CON save and on a success removes the stunned condition.`
    ,
    necrotic2h: `When a target takes damage from this weapon it is affected by ACR (acute radiation syndrome). 
        ACR does no additional damage on it's own but most humanoid species will die within 48 hours of exposure. 
        If an attack with this kind of weapon scores a critical hit the target starts vomiting uncontrollably and is affected by the stunned condition. 
        At the end of each of it's turns the target makes a DC 20 CON save and on a success removes the stunned condition.`
    ,
    physical1h: `When you decide to use a devouring weapon, you first need to take damage yourself and only then attack. 
        If your attack hits, it does it's normal damage in addition to the damage you took. 
        On a critical strike you heal all the damage you took from the weapon and your target takes the critical damage along with the damage you took. 
        Devouring weapons do true damage to you, and your target takes damage of your choice between slashing, piercing or bludgeoning.`
    ,
    physical2h: `When you decide to use a devouring weapon, you first need to take damage yourself and only then attack. 
        If your attack hits, it does it's normal damage in addition to the damage you took. 
        On a critical strike you heal all the damage you took from the weapon and your target takes the critical damage along with the damage you took. 
        Devouring weapons do true damage to you, and your target takes damage of your choice between slashing, piercing or bludgeoning.`
}