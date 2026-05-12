import { Language, LANGUAGES } from "../shared/names";
import {
  CatastropheKind,
  CatastropheSeverity,
  DayPhase,
  Season,
} from "../shared/protocol";

export interface Strings {
  // lobby
  lobbyTitle: string;
  lobbySubtitle: string;
  lobbyPlay: string;
  lobbyEnterName: string;
  lobbyNamePlaceholder: string;
  lobbyConnecting: string;
  lobbyError: (m: string) => string;
  lobbyConnectionLost: string;
  lobbyChooseLanguage: string;

  // hud / resources
  resHolz: string;
  resWasser: string;
  resBeeren: string;
  resPilze: string;
  resFleisch: string;
  resFisch: string;
  resStein: string;
  resKreuter: string;
  resFelle: string;
  hudTribeMembers: string;
  hudWaitingForOthers: string;
  hudYou: string;
  hudTribeOf: (name: string) => string;
  hudTribeFallback: (id: number) => string;

  // growth
  growthLabel: string;
  growthFull: string;
  growthTooFew: string;
  growthNoMan: string;
  growthNoWoman: string;
  growthImminent: string;
  growthPaused: string;

  // toasts
  toastBackToTribe: string;
  toastSpectating: (name: string) => string;
  toastJoinedTribe: (name: string) => string;
  toastLeftGame: (name: string) => string;
  toastEncounterWith: (name: string) => string;
  toastWomenJoinedYouSing: string;
  toastWomenJoinedYou: (n: number) => string;
  toastWomenLeftYouSing: string;
  toastWomenLeftYou: (n: number) => string;
  toastWomenMovedToSing: (name: string) => string;
  toastWomenMovedTo: (n: number, name: string) => string;
  toastEncounterTribes: (a: string, b: string, moves: string) => string;
  toastEncounterTribesMet: (a: string, b: string) => string;
  toastOwnGrewSing: string;
  toastOwnGrew: (n: number) => string;
  toastOtherGrewSing: (name: string) => string;
  toastOtherGrew: (name: string, n: number) => string;
  toastOwnDiedSing: string;
  toastOwnDied: (n: number) => string;
  toastOtherDiedSing: (name: string) => string;
  toastOtherDied: (name: string, n: number) => string;
  toastExtinct: (name: string) => string;
  toastTribeFounded: (name: string) => string;
  toastTribeSplit: (parent: string, child: string) => string;
  toastOwnCampfire: string;
  toastOtherCampfire: (name: string) => string;
  toastCampfireNotVisible: string;
  toastCampfireMissingResources: string;
  toastCampfireNotHere: string;
  toastCampfireTooFar: string;
  toastArtifactOwn: (reward: string) => string;
  toastArtifactOther: (name: string, reward: string) => string;
  toastNightfall: string;
  toastSunriseSafe: string;
  toastSunriseLost: (deathSummary: string) => string;
  phaseLabel: (p: DayPhase) => string;
  phaseIcon: (p: DayPhase) => string;
  seasonLabel: (s: Season) => string;
  seasonIcon: (s: Season) => string;
  toastSeasonStart: (label: string) => string;
  toastCatastrophe: (kind: CatastropheKind, severity: CatastropheSeverity) => string;
  catastropheIcon: (kind: CatastropheKind) => string;

  // rewards
  rewardNewMember: string;
  rewardAmount: (kind: string, amount: number) => string;

  // game over
  goTitle: string;
  goStatistics: string;
  goSurvival: string;
  goMaxTribe: string;
  goCollectedTotal: string;
  goPoints: string;
  goResources: string;
  goLeaderboard: string;
  goRestart: string;
  victoryTitle: string;
  victorySubtitle: string;
  victoryStatTribes: string;
  victoryOtherTitle: (name: string) => string;
  victoryOtherSubtitle: (name: string) => string;
  lbHeaderRank: string;
  lbHeaderTribe: string;
  lbHeaderTime: string;
  lbHeaderCollected: string;
  lbHeaderMembers: string;
  lbHeaderScore: string;
  lbLoading: string;
  lbEmpty: string;
  lbYourRank: (rank: number) => string;

  // help / tips
  helpTipBerry: string;
  helpTipWater: string;
  helpTipBirth: string;
  helpTipVolcano: string;
  helpTipWood: string;
  helpTipClub: string;
  helpTipCampfire: string;
  helpTipMushroom: string;
  helpTipStone: string;
  helpTipSpear: string;
  helpTipTracks: string;
  helpTipStoneHunt: string;
  helpEnabled: string;
  helpDisabled: string;

  // info panel
  infoTitle: string;
  infoSectionOverview: string;
  infoSectionResources: string;
  infoSeason: string;
  infoPhase: string;
  infoSurvival: string;
  infoTribeSize: string;
  infoMales: string;
  infoFemales: string;
  infoMaxTribe: string;
  infoGrowth: string;
  infoCollectedTotal: string;
  infoHint: string;
}

const STRINGS: Record<Language, Strings> = {
  de: {
    lobbyTitle: "Stämme: Jäger und Sammler",
    lobbySubtitle: "Gib deinen Namen ein",
    lobbyPlay: "Spielen",
    lobbyEnterName: "Bitte Namen eingeben",
    lobbyNamePlaceholder: "Dein Name",
    lobbyConnecting: "Verbinde …",
    lobbyError: (m) => `Fehler: ${m}`,
    lobbyConnectionLost: "Verbindung verloren",
    lobbyChooseLanguage: "Sprache",

    resHolz: "Holz",
    resWasser: "Wasser",
    resBeeren: "Beeren",
    resPilze: "Pilze",
    resFleisch: "Fleisch",
    resFisch: "Fisch",
    resStein: "Stein",
    resKreuter: "Kräuter",
    resFelle: "Felle",
    hudTribeMembers: "Stammesmitglieder",
    hudWaitingForOthers: "Warte auf weitere Stämme …",
    hudYou: "Du",
    hudTribeOf: (n) => `Stamm von ${n}`,
    hudTribeFallback: (id) => `Stamm ${id}`,

    growthLabel: "Wachstum",
    growthFull: "Stamm voll",
    growthTooFew: "zu wenig Stammesmitglieder",
    growthNoMan: "kein Mann im Stamm",
    growthNoWoman: "keine Frau im Stamm",
    growthImminent: "Geburt steht bevor",
    growthPaused: "pausiert",

    toastBackToTribe: "Zurück zu deinem Stamm",
    toastSpectating: (n) => `Beobachte: ${n}`,
    toastJoinedTribe: (n) => `Stamm von ${n} ist beigetreten`,
    toastLeftGame: (n) => `Stamm von ${n} hat das Spiel verlassen`,
    toastEncounterWith: (n) => `Begegnung mit Stamm von ${n}`,
    toastWomenJoinedYouSing: "eine Frau ist zu dir gewechselt",
    toastWomenJoinedYou: (n) => `${n} Frauen sind zu dir gewechselt`,
    toastWomenLeftYouSing: "eine Frau hat deinen Stamm verlassen",
    toastWomenLeftYou: (n) => `${n} Frauen haben deinen Stamm verlassen`,
    toastWomenMovedToSing: (n) => `eine Frau wechselte zum Stamm von ${n}`,
    toastWomenMovedTo: (n, name) =>
      `${n} Frauen wechselten zum Stamm von ${name}`,
    toastEncounterTribes: (a, b, moves) =>
      `Begegnung der Stämme ${a} und ${b}: ${moves}`,
    toastEncounterTribesMet: (a, b) => `Stamm ${a} trifft Stamm ${b}`,
    toastOwnGrewSing: "Dein Stamm wächst: ein neues Mitglied ist dazugekommen",
    toastOwnGrew: (n) =>
      `Dein Stamm wächst: ${n} neue Mitglieder sind dazugekommen`,
    toastOtherGrewSing: (n) => `Stamm von ${n} wächst: ein neues Mitglied`,
    toastOtherGrew: (n, k) => `Stamm von ${n} wächst: ${k} neue Mitglieder`,
    toastOwnDiedSing: "Aus deinem Stamm ist ein Mitglied gestorben",
    toastOwnDied: (n) => `Aus deinem Stamm sind ${n} Mitglieder gestorben`,
    toastOtherDiedSing: (n) => `Im Stamm von ${n} ist ein Mitglied gestorben`,
    toastOtherDied: (n, k) =>
      `Im Stamm von ${n} sind ${k} Mitglieder gestorben`,
    toastExtinct: (n) => `Stamm von ${n} ist ausgestorben`,
    toastTribeFounded: (n) => `Stamm von ${n} wurde gegründet`,
    toastTribeSplit: (a, b) => `Stamm ${a} ist zu groß geworden — ein Teil spaltet sich ab und gründet Stamm ${b}`,
    toastOwnCampfire: "Dein Stamm hat ein Lagerfeuer entzündet",
    toastOtherCampfire: (n) => `Stamm von ${n} hat ein Lagerfeuer entzündet`,
    toastCampfireNotVisible: "Lagerfeuer hier nicht sichtbar",
    toastCampfireMissingResources: "Nicht genug Holz und Stein für ein Lagerfeuer",
    toastCampfireNotHere: "Hier kann kein Lagerfeuer entzündet werden",
    toastCampfireTooFar: "Zu weit weg vom Stamm für ein Lagerfeuer",
    toastArtifactOwn: (r) => `Mythisches Artefakt entdeckt! Belohnung: ${r}`,
    toastArtifactOther: (n, r) =>
      `Stamm von ${n} hat ein mythisches Artefakt entdeckt (${r})`,
    toastNightfall: "Die Nacht bricht herein – sammelt euch ums Lagerfeuer!",
    toastSunriseSafe: "Sonnenaufgang – euer Stamm hat die Nacht überstanden",
    toastSunriseLost: (s) => `Sonnenaufgang – ${s}`,
    phaseLabel: (p) =>
      p === "morning" ? "Vormittag" :
      p === "noon" ? "Mittag" :
      p === "afternoon" ? "Nachmittag" : "Nacht",
    phaseIcon: (p) =>
      p === "morning" ? "🌅" :
      p === "noon" ? "☀️" :
      p === "afternoon" ? "🌇" : "🌙",
    seasonLabel: (sn) =>
      sn === "spring" ? "Frühling" :
      sn === "summer" ? "Sommer" :
      sn === "autumn" ? "Herbst" : "Winter",
    seasonIcon: (sn) =>
      sn === "spring" ? "🌱" :
      sn === "summer" ? "☀️" :
      sn === "autumn" ? "🍂" : "❄️",
    toastSeasonStart: (l) => `${l} beginnt`,
    catastropheIcon: (k) =>
      k === "quake" ? "🌐" :
      k === "flood" ? "🌊" :
      k === "drought" ? "🥵" :
      k === "freeze" ? "🥶" :
      k === "meteor" ? "☄️" :
      k === "eruption" ? "🌋" :
      k === "wildfire" ? "🔥" :
      k === "storm" ? "🌪️" :
      k === "lightning" ? "⚡" :
      k === "locusts" ? "🦗" : "⛰️",
    toastCatastrophe: (k, sev) => {
      const intensity = sev === 3 ? "Verheerend" : sev === 2 ? "Schwer" : "Leicht";
      const name =
        k === "quake" ? "Erdbeben" :
        k === "flood" ? "Hochwasser" :
        k === "drought" ? "Dürre" :
        k === "freeze" ? "Eiskälte" :
        k === "meteor" ? "Meteoreinschlag droht!" :
        k === "eruption" ? "Vulkanausbruch" :
        k === "wildfire" ? "Waldbrand" :
        k === "storm" ? "Sturm" :
        k === "lightning" ? "Blitzschlag" :
        k === "locusts" ? "Heuschreckenplage" : "Erdrutsch";
      if (k === "meteor") return `☄️ ${name}`;
      return `${intensity}es ${name}`;
    },

    rewardNewMember: "ein neues Stammesmitglied",
    rewardAmount: (k, a) => `${a} ${k}`,

    goTitle: "Dein Stamm ist ausgestorben",
    goStatistics: "Statistik",
    goSurvival: "Überlebenszeit",
    goMaxTribe: "Stammesmitglieder (max.)",
    goCollectedTotal: "Gesammelt gesamt",
    goPoints: "Punkte",
    goResources: "Ressourcen",
    goLeaderboard: "Bestenliste",
    goRestart: "Neu starten",
    victoryTitle: "Sieg! Alle Stämme stammen von dir ab",
    victorySubtitle: "Dein Ursprungsstamm hat sich durch Teilung über alle Plätze ausgebreitet.",
    victoryStatTribes: "Stämme deines Ursprungs",
    victoryOtherTitle: (n) => `Sieg für ${n}`,
    victoryOtherSubtitle: (n) =>
      `Alle aktiven Stämme stammen vom Ursprung von ${n} ab.`,
    lbHeaderRank: "#",
    lbHeaderTribe: "Stamm",
    lbHeaderTime: "Zeit",
    lbHeaderCollected: "Sml.",
    lbHeaderMembers: "Mitg.",
    lbHeaderScore: "Pkt.",
    lbLoading: "Bestenliste lädt …",
    lbEmpty: "Noch keine Einträge.",
    lbYourRank: (r) => `Dein Platz: #${r}`,

    helpTipBerry: "Läufe an Beeren vorbei und dein Stamm sammelt sie ein...",
    helpTipWater: "Wasser brauchst du zum Leben — aber auch Fische… Vorsicht vor Alligatoren!",
    helpTipBirth: "Geburt! Wenn Mann und Frau zusammen sind und genug Nahrung haben, wächst dein Stamm. Jedes Kind braucht Zeit, bevor es selbst sammeln oder jagen kann.",
    helpTipVolcano: "Ein Vulkan! In seiner Nähe kann sich dein Stamm das Holz für das nächtliche Lagerfeuer sparen.",
    helpTipWood: "Holz — euer wichtigster Rohstoff. Daraus macht ihr Feuer für die Nacht und schnitzt Knüppel und Speere für die Jagd.",
    helpTipClub: "Mit einem Holzknüppel kannst du Tiere viel besser jagen als mit bloßen Händen.",
    helpTipCampfire: "Jeden Abend braucht dein Stamm Schutz — das Lagerfeuer wärmt und vertreibt wilde Tiere.",
    helpTipMushroom: "Pilze sind wertvolle Lebensmittel — sammelt sie unterwegs ein.",
    helpTipStone: "Sammle Steine — du brauchst sie zum Feuermachen und als Waffen.",
    helpTipSpear: "Mit Speeren kann dein Stamm Tiere viel besser jagen — für einen Speer brauchst du Holz und Stein.",
    helpTipTracks: "Beim Laufen hinterlässt dein Stamm Spuren — daran lassen sich andere Stämme finden.",
    helpTipStoneHunt: "Deine erste Waffe: der Stein — damit lassen sich Tiere jagen.",
    helpEnabled: "Hilfetexte: An (h)",
    helpDisabled: "Hilfetexte: Aus (h)",

    infoTitle: "Stamm – Übersicht",
    infoSectionOverview: "Stamm",
    infoSectionResources: "Vorräte",
    infoSeason: "Jahreszeit",
    infoPhase: "Tageszeit",
    infoSurvival: "Überlebenszeit",
    infoTribeSize: "Stammesmitglieder",
    infoMales: "Männer",
    infoFemales: "Frauen",
    infoMaxTribe: "Max. Stammesgröße",
    infoGrowth: "Wachstum",
    infoCollectedTotal: "Gesammelt gesamt",
    infoHint: "i schließen · h Hilfetipps",
  },

  en: {
    lobbyTitle: "Tribes: Hunters and Gatherers",
    lobbySubtitle: "Enter your name",
    lobbyPlay: "Play",
    lobbyEnterName: "Please enter a name",
    lobbyNamePlaceholder: "Your name",
    lobbyConnecting: "Connecting …",
    lobbyError: (m) => `Error: ${m}`,
    lobbyConnectionLost: "Connection lost",
    lobbyChooseLanguage: "Language",

    resHolz: "Wood",
    resWasser: "Water",
    resBeeren: "Berries",
    resPilze: "Mushrooms",
    resFleisch: "Meat",
    resFisch: "Fish",
    resStein: "Stone",
    resKreuter: "Herbs",
    resFelle: "Hides",
    hudTribeMembers: "Tribe members",
    hudWaitingForOthers: "Waiting for more tribes …",
    hudYou: "You",
    hudTribeOf: (n) => `${n}'s tribe`,
    hudTribeFallback: (id) => `Tribe ${id}`,

    growthLabel: "Growth",
    growthFull: "Tribe full",
    growthTooFew: "too few tribe members",
    growthNoMan: "no man in the tribe",
    growthNoWoman: "no woman in the tribe",
    growthImminent: "birth imminent",
    growthPaused: "paused",

    toastBackToTribe: "Back to your tribe",
    toastSpectating: (n) => `Spectating: ${n}`,
    toastJoinedTribe: (n) => `${n}'s tribe has joined`,
    toastLeftGame: (n) => `${n}'s tribe has left the game`,
    toastEncounterWith: (n) => `Encounter with ${n}'s tribe`,
    toastWomenJoinedYouSing: "a woman joined you",
    toastWomenJoinedYou: (n) => `${n} women joined you`,
    toastWomenLeftYouSing: "a woman left your tribe",
    toastWomenLeftYou: (n) => `${n} women left your tribe`,
    toastWomenMovedToSing: (n) => `a woman moved to ${n}'s tribe`,
    toastWomenMovedTo: (n, name) => `${n} women moved to ${name}'s tribe`,
    toastEncounterTribes: (a, b, moves) =>
      `Encounter between ${a} and ${b}: ${moves}`,
    toastEncounterTribesMet: (a, b) => `${a}'s tribe meets ${b}'s tribe`,
    toastOwnGrewSing: "Your tribe grows: a new member has joined",
    toastOwnGrew: (n) => `Your tribe grows: ${n} new members have joined`,
    toastOtherGrewSing: (n) => `${n}'s tribe grows: a new member`,
    toastOtherGrew: (n, k) => `${n}'s tribe grows: ${k} new members`,
    toastOwnDiedSing: "A member of your tribe has died",
    toastOwnDied: (n) => `${n} members of your tribe have died`,
    toastOtherDiedSing: (n) => `A member of ${n}'s tribe has died`,
    toastOtherDied: (n, k) => `${k} members of ${n}'s tribe have died`,
    toastExtinct: (n) => `${n}'s tribe has gone extinct`,
    toastTribeFounded: (n) => `${n}'s tribe was founded`,
    toastTribeSplit: (a, b) => `${a}'s tribe grew too large — half splits off and founds tribe ${b}`,
    toastOwnCampfire: "Your tribe lit a campfire",
    toastOtherCampfire: (n) => `${n}'s tribe lit a campfire`,
    toastCampfireNotVisible: "Campfire not visible here",
    toastCampfireMissingResources: "Not enough wood and stone for a campfire",
    toastCampfireNotHere: "Cannot light a campfire here",
    toastCampfireTooFar: "Too far from your tribe for a campfire",
    toastArtifactOwn: (r) => `Mythic artifact discovered! Reward: ${r}`,
    toastArtifactOther: (n, r) =>
      `${n}'s tribe discovered a mythic artifact (${r})`,
    toastNightfall: "Night falls – gather around the campfire!",
    toastSunriseSafe: "Sunrise – your tribe survived the night",
    toastSunriseLost: (s) => `Sunrise – ${s}`,
    phaseLabel: (p) =>
      p === "morning" ? "Morning" :
      p === "noon" ? "Noon" :
      p === "afternoon" ? "Afternoon" : "Night",
    phaseIcon: (p) =>
      p === "morning" ? "🌅" :
      p === "noon" ? "☀️" :
      p === "afternoon" ? "🌇" : "🌙",
    seasonLabel: (sn) =>
      sn === "spring" ? "Spring" :
      sn === "summer" ? "Summer" :
      sn === "autumn" ? "Autumn" : "Winter",
    seasonIcon: (sn) =>
      sn === "spring" ? "🌱" :
      sn === "summer" ? "☀️" :
      sn === "autumn" ? "🍂" : "❄️",
    toastSeasonStart: (l) => `${l} begins`,
    catastropheIcon: (k) =>
      k === "quake" ? "🌐" :
      k === "flood" ? "🌊" :
      k === "drought" ? "🥵" :
      k === "freeze" ? "🥶" :
      k === "meteor" ? "☄️" :
      k === "eruption" ? "🌋" :
      k === "wildfire" ? "🔥" :
      k === "storm" ? "🌪️" :
      k === "lightning" ? "⚡" :
      k === "locusts" ? "🦗" : "⛰️",
    toastCatastrophe: (k, sev) => {
      const intensity = sev === 3 ? "Devastating" : sev === 2 ? "Severe" : "Minor";
      const name =
        k === "quake" ? "earthquake" :
        k === "flood" ? "flood" :
        k === "drought" ? "drought" :
        k === "freeze" ? "freeze" :
        k === "meteor" ? "Meteor incoming!" :
        k === "eruption" ? "volcanic eruption" :
        k === "wildfire" ? "wildfire" :
        k === "storm" ? "storm" :
        k === "lightning" ? "lightning strike" :
        k === "locusts" ? "locust swarm" : "landslide";
      if (k === "meteor") return `☄️ ${name}`;
      return `${intensity} ${name}`;
    },

    rewardNewMember: "a new tribe member",
    rewardAmount: (k, a) => `${a} ${k}`,

    goTitle: "Your tribe has gone extinct",
    goStatistics: "Statistics",
    goSurvival: "Survival time",
    goMaxTribe: "Tribe members (max.)",
    goCollectedTotal: "Total collected",
    goPoints: "Score",
    goResources: "Resources",
    goLeaderboard: "Leaderboard",
    goRestart: "Restart",
    victoryTitle: "Victory! Every tribe descends from yours",
    victorySubtitle: "Your origin tribe has spread to every slot through splits.",
    victoryStatTribes: "Tribes of your origin",
    victoryOtherTitle: (n) => `Victory for ${n}`,
    victoryOtherSubtitle: (n) => `All active tribes descend from ${n}'s origin.`,
    lbHeaderRank: "#",
    lbHeaderTribe: "Tribe",
    lbHeaderTime: "Time",
    lbHeaderCollected: "Coll.",
    lbHeaderMembers: "Mem.",
    lbHeaderScore: "Pts.",
    lbLoading: "Loading leaderboard …",
    lbEmpty: "No entries yet.",
    lbYourRank: (r) => `Your rank: #${r}`,

    helpTipBerry: "Walk past berries and your tribe will collect them...",
    helpTipWater: "You need water to live — and fish too… watch out for alligators!",
    helpTipBirth: "A birth! When men and women are together and have enough food, your tribe grows. Every child needs time before it can gather or hunt on its own.",
    helpTipVolcano: "A volcano! Nearby, your tribe can save the wood for the nightly campfire.",
    helpTipWood: "Wood — your most important resource. Use it to build fires for the night and carve clubs and spears for the hunt.",
    helpTipClub: "With a wooden club you can hunt animals far better than with bare hands.",
    helpTipCampfire: "Every evening your tribe needs shelter — the campfire warms them and scares off wild animals.",
    helpTipMushroom: "Mushrooms are valuable food — gather them as you pass by.",
    helpTipStone: "Collect stones — you need them to make fire and as weapons.",
    helpTipSpear: "With spears your tribe hunts animals far better — to craft a spear you need wood and stone.",
    helpTipTracks: "Your tribe leaves footprints as it walks — that's how other tribes can find each other.",
    helpTipStoneHunt: "Your first weapon: the stone — use it to hunt animals.",
    helpEnabled: "Help tips: On (h)",
    helpDisabled: "Help tips: Off (h)",

    infoTitle: "Tribe – Overview",
    infoSectionOverview: "Tribe",
    infoSectionResources: "Stockpile",
    infoSeason: "Season",
    infoPhase: "Time of day",
    infoSurvival: "Survival time",
    infoTribeSize: "Tribe members",
    infoMales: "Men",
    infoFemales: "Women",
    infoMaxTribe: "Max. tribe size",
    infoGrowth: "Growth",
    infoCollectedTotal: "Total collected",
    infoHint: "i close · h help tips",
  },

  it: {
    lobbyTitle: "Tribù: cacciatori e raccoglitori",
    lobbySubtitle: "Inserisci il tuo nome",
    lobbyPlay: "Gioca",
    lobbyEnterName: "Inserisci un nome",
    lobbyNamePlaceholder: "Il tuo nome",
    lobbyConnecting: "Connessione …",
    lobbyError: (m) => `Errore: ${m}`,
    lobbyConnectionLost: "Connessione persa",
    lobbyChooseLanguage: "Lingua",

    resHolz: "Legno",
    resWasser: "Acqua",
    resBeeren: "Bacche",
    resPilze: "Funghi",
    resFleisch: "Carne",
    resFisch: "Pesce",
    resStein: "Pietra",
    resKreuter: "Erbe",
    resFelle: "Pelli",
    hudTribeMembers: "Membri della tribù",
    hudWaitingForOthers: "In attesa di altre tribù …",
    hudYou: "Tu",
    hudTribeOf: (n) => `Tribù di ${n}`,
    hudTribeFallback: (id) => `Tribù ${id}`,

    growthLabel: "Crescita",
    growthFull: "Tribù al completo",
    growthTooFew: "troppo pochi membri",
    growthNoMan: "nessun uomo nella tribù",
    growthNoWoman: "nessuna donna nella tribù",
    growthImminent: "nascita imminente",
    growthPaused: "in pausa",

    toastBackToTribe: "Torna alla tua tribù",
    toastSpectating: (n) => `Osservi: ${n}`,
    toastJoinedTribe: (n) => `La tribù di ${n} si è unita`,
    toastLeftGame: (n) => `La tribù di ${n} ha lasciato la partita`,
    toastEncounterWith: (n) => `Incontro con la tribù di ${n}`,
    toastWomenJoinedYouSing: "una donna è passata alla tua tribù",
    toastWomenJoinedYou: (n) => `${n} donne sono passate alla tua tribù`,
    toastWomenLeftYouSing: "una donna ha lasciato la tua tribù",
    toastWomenLeftYou: (n) => `${n} donne hanno lasciato la tua tribù`,
    toastWomenMovedToSing: (n) => `una donna è passata alla tribù di ${n}`,
    toastWomenMovedTo: (n, name) => `${n} donne sono passate alla tribù di ${name}`,
    toastEncounterTribes: (a, b, moves) =>
      `Incontro tra le tribù di ${a} e ${b}: ${moves}`,
    toastEncounterTribesMet: (a, b) =>
      `La tribù di ${a} incontra la tribù di ${b}`,
    toastOwnGrewSing: "La tua tribù cresce: un nuovo membro si è aggiunto",
    toastOwnGrew: (n) => `La tua tribù cresce: ${n} nuovi membri si sono aggiunti`,
    toastOtherGrewSing: (n) => `La tribù di ${n} cresce: un nuovo membro`,
    toastOtherGrew: (n, k) => `La tribù di ${n} cresce: ${k} nuovi membri`,
    toastOwnDiedSing: "Un membro della tua tribù è morto",
    toastOwnDied: (n) => `${n} membri della tua tribù sono morti`,
    toastOtherDiedSing: (n) => `Un membro della tribù di ${n} è morto`,
    toastOtherDied: (n, k) => `${k} membri della tribù di ${n} sono morti`,
    toastExtinct: (n) => `La tribù di ${n} si è estinta`,
    toastTribeFounded: (n) => `La tribù di ${n} è stata fondata`,
    toastTribeSplit: (a, b) => `La tribù ${a} è cresciuta troppo — una parte si separa e fonda la tribù ${b}`,
    toastOwnCampfire: "La tua tribù ha acceso un falò",
    toastOtherCampfire: (n) => `La tribù di ${n} ha acceso un falò`,
    toastCampfireNotVisible: "Falò non visibile qui",
    toastCampfireMissingResources: "Legno e pietra insufficienti per un falò",
    toastCampfireNotHere: "Qui non si può accendere un falò",
    toastCampfireTooFar: "Troppo lontano dalla tribù per un falò",
    toastArtifactOwn: (r) => `Artefatto mitico scoperto! Ricompensa: ${r}`,
    toastArtifactOther: (n, r) =>
      `La tribù di ${n} ha scoperto un artefatto mitico (${r})`,
    toastNightfall: "Cala la notte – radunatevi attorno al falò!",
    toastSunriseSafe: "Alba – la tua tribù è sopravvissuta alla notte",
    toastSunriseLost: (s) => `Alba – ${s}`,
    phaseLabel: (p) =>
      p === "morning" ? "Mattino" :
      p === "noon" ? "Mezzogiorno" :
      p === "afternoon" ? "Pomeriggio" : "Notte",
    phaseIcon: (p) =>
      p === "morning" ? "🌅" :
      p === "noon" ? "☀️" :
      p === "afternoon" ? "🌇" : "🌙",
    seasonLabel: (sn) =>
      sn === "spring" ? "Primavera" :
      sn === "summer" ? "Estate" :
      sn === "autumn" ? "Autunno" : "Inverno",
    seasonIcon: (sn) =>
      sn === "spring" ? "🌱" :
      sn === "summer" ? "☀️" :
      sn === "autumn" ? "🍂" : "❄️",
    toastSeasonStart: (l) => `Inizia ${l}`,
    catastropheIcon: (k) =>
      k === "quake" ? "🌐" : k === "flood" ? "🌊" : k === "drought" ? "🥵" :
      k === "freeze" ? "🥶" : k === "meteor" ? "☄️" : k === "eruption" ? "🌋" :
      k === "wildfire" ? "🔥" : k === "storm" ? "🌪️" : k === "lightning" ? "⚡" :
      k === "locusts" ? "🦗" : "⛰️",
    toastCatastrophe: (k, sev) => {
      const intensity = sev === 3 ? "Devastante" : sev === 2 ? "Grave" : "Lieve";
      const name =
        k === "quake" ? "terremoto" :
        k === "flood" ? "inondazione" :
        k === "drought" ? "siccità" :
        k === "freeze" ? "gelo" :
        k === "meteor" ? "Meteorite in arrivo!" :
        k === "eruption" ? "eruzione vulcanica" :
        k === "wildfire" ? "incendio boschivo" :
        k === "storm" ? "tempesta" :
        k === "lightning" ? "fulmine" :
        k === "locusts" ? "sciame di locuste" : "frana";
      if (k === "meteor") return `☄️ ${name}`;
      return `${name} ${intensity.toLowerCase()}`;
    },

    rewardNewMember: "un nuovo membro della tribù",
    rewardAmount: (k, a) => `${a} ${k}`,

    goTitle: "La tua tribù si è estinta",
    goStatistics: "Statistiche",
    goSurvival: "Tempo di sopravvivenza",
    goMaxTribe: "Membri della tribù (max.)",
    goCollectedTotal: "Raccolto totale",
    goPoints: "Punti",
    goResources: "Risorse",
    goLeaderboard: "Classifica",
    goRestart: "Ricomincia",
    victoryTitle: "Vittoria! Tutte le tribù discendono dalla tua",
    victorySubtitle: "La tua tribù d'origine si è diffusa in tutti gli slot tramite le scissioni.",
    victoryStatTribes: "Tribù della tua origine",
    victoryOtherTitle: (n) => `Vittoria di ${n}`,
    victoryOtherSubtitle: (n) => `Tutte le tribù attive discendono dall'origine di ${n}.`,
    lbHeaderRank: "#",
    lbHeaderTribe: "Tribù",
    lbHeaderTime: "Tempo",
    lbHeaderCollected: "Racc.",
    lbHeaderMembers: "Mem.",
    lbHeaderScore: "Pti.",
    lbLoading: "Caricamento classifica …",
    lbEmpty: "Ancora nessuna voce.",
    lbYourRank: (r) => `La tua posizione: #${r}`,

    helpTipBerry: "Passa accanto alle bacche e la tua tribù le raccoglierà...",
    helpTipWater: "L'acqua ti serve per vivere — e anche i pesci… attento agli alligatori!",
    helpTipBirth: "Una nascita! Quando uomini e donne stanno insieme e c'è cibo a sufficienza, la tribù cresce. Ogni bambino ha bisogno di tempo prima di poter raccogliere o cacciare da solo.",
    helpTipVolcano: "Un vulcano! Nelle sue vicinanze la tua tribù può risparmiare la legna per il falò notturno.",
    helpTipWood: "Legna — la tua risorsa più importante. Serve per accendere il fuoco notturno e per intagliare mazze e lance per la caccia.",
    helpTipClub: "Con una mazza di legno puoi cacciare gli animali molto meglio che a mani nude.",
    helpTipCampfire: "Ogni sera la tua tribù ha bisogno di riparo — il falò scalda e tiene lontane le bestie selvatiche.",
    helpTipMushroom: "I funghi sono cibo prezioso — raccoglili lungo il cammino.",
    helpTipStone: "Raccogli pietre — ti servono per accendere il fuoco e come armi.",
    helpTipSpear: "Con le lance la tua tribù caccia molto meglio — per fare una lancia servono legno e pietra.",
    helpTipTracks: "Camminando la tua tribù lascia impronte — così le altre tribù possono trovarsi.",
    helpTipStoneHunt: "La tua prima arma: la pietra — usala per cacciare gli animali.",
    helpEnabled: "Suggerimenti: Attivi (h)",
    helpDisabled: "Suggerimenti: Disattivati (h)",

    infoTitle: "Tribù – Riepilogo",
    infoSectionOverview: "Tribù",
    infoSectionResources: "Scorte",
    infoSeason: "Stagione",
    infoPhase: "Momento del giorno",
    infoSurvival: "Tempo di sopravvivenza",
    infoTribeSize: "Membri della tribù",
    infoMales: "Uomini",
    infoFemales: "Donne",
    infoMaxTribe: "Dim. max. tribù",
    infoGrowth: "Crescita",
    infoCollectedTotal: "Raccolto totale",
    infoHint: "i chiudi · h suggerimenti",
  },

  es: {
    lobbyTitle: "Tribus: cazadores y recolectores",
    lobbySubtitle: "Introduce tu nombre",
    lobbyPlay: "Jugar",
    lobbyEnterName: "Introduce un nombre",
    lobbyNamePlaceholder: "Tu nombre",
    lobbyConnecting: "Conectando …",
    lobbyError: (m) => `Error: ${m}`,
    lobbyConnectionLost: "Conexión perdida",
    lobbyChooseLanguage: "Idioma",

    resHolz: "Madera",
    resWasser: "Agua",
    resBeeren: "Bayas",
    resPilze: "Hongos",
    resFleisch: "Carne",
    resFisch: "Pescado",
    resStein: "Piedra",
    resKreuter: "Hierbas",
    resFelle: "Pieles",
    hudTribeMembers: "Miembros de la tribu",
    hudWaitingForOthers: "Esperando a más tribus …",
    hudYou: "Tú",
    hudTribeOf: (n) => `Tribu de ${n}`,
    hudTribeFallback: (id) => `Tribu ${id}`,

    growthLabel: "Crecimiento",
    growthFull: "Tribu completa",
    growthTooFew: "miembros insuficientes",
    growthNoMan: "ningún hombre en la tribu",
    growthNoWoman: "ninguna mujer en la tribu",
    growthImminent: "nacimiento inminente",
    growthPaused: "pausado",

    toastBackToTribe: "Vuelve a tu tribu",
    toastSpectating: (n) => `Observas: ${n}`,
    toastJoinedTribe: (n) => `La tribu de ${n} se ha unido`,
    toastLeftGame: (n) => `La tribu de ${n} ha abandonado la partida`,
    toastEncounterWith: (n) => `Encuentro con la tribu de ${n}`,
    toastWomenJoinedYouSing: "una mujer se ha unido a ti",
    toastWomenJoinedYou: (n) => `${n} mujeres se han unido a ti`,
    toastWomenLeftYouSing: "una mujer ha dejado tu tribu",
    toastWomenLeftYou: (n) => `${n} mujeres han dejado tu tribu`,
    toastWomenMovedToSing: (n) => `una mujer se ha unido a la tribu de ${n}`,
    toastWomenMovedTo: (n, name) => `${n} mujeres se han unido a la tribu de ${name}`,
    toastEncounterTribes: (a, b, moves) =>
      `Encuentro entre las tribus de ${a} y ${b}: ${moves}`,
    toastEncounterTribesMet: (a, b) =>
      `La tribu de ${a} se encuentra con la tribu de ${b}`,
    toastOwnGrewSing: "Tu tribu crece: un nuevo miembro se ha incorporado",
    toastOwnGrew: (n) => `Tu tribu crece: ${n} nuevos miembros se han incorporado`,
    toastOtherGrewSing: (n) => `La tribu de ${n} crece: un nuevo miembro`,
    toastOtherGrew: (n, k) => `La tribu de ${n} crece: ${k} nuevos miembros`,
    toastOwnDiedSing: "Un miembro de tu tribu ha muerto",
    toastOwnDied: (n) => `${n} miembros de tu tribu han muerto`,
    toastOtherDiedSing: (n) => `Un miembro de la tribu de ${n} ha muerto`,
    toastOtherDied: (n, k) => `${k} miembros de la tribu de ${n} han muerto`,
    toastExtinct: (n) => `La tribu de ${n} se ha extinguido`,
    toastTribeFounded: (n) => `La tribu de ${n} ha sido fundada`,
    toastTribeSplit: (a, b) => `La tribu ${a} ha crecido demasiado — una parte se separa y funda la tribu ${b}`,
    toastOwnCampfire: "Tu tribu ha encendido una hoguera",
    toastOtherCampfire: (n) => `La tribu de ${n} ha encendido una hoguera`,
    toastCampfireNotVisible: "Hoguera no visible aquí",
    toastCampfireMissingResources: "Madera y piedra insuficientes para una hoguera",
    toastCampfireNotHere: "Aquí no se puede encender una hoguera",
    toastCampfireTooFar: "Demasiado lejos de tu tribu para una hoguera",
    toastArtifactOwn: (r) => `¡Artefacto mítico descubierto! Recompensa: ${r}`,
    toastArtifactOther: (n, r) =>
      `La tribu de ${n} ha descubierto un artefacto mítico (${r})`,
    toastNightfall: "Cae la noche – ¡reuníos en torno a la hoguera!",
    toastSunriseSafe: "Amanecer – tu tribu sobrevivió la noche",
    toastSunriseLost: (s) => `Amanecer – ${s}`,
    phaseLabel: (p) =>
      p === "morning" ? "Mañana" :
      p === "noon" ? "Mediodía" :
      p === "afternoon" ? "Tarde" : "Noche",
    phaseIcon: (p) =>
      p === "morning" ? "🌅" :
      p === "noon" ? "☀️" :
      p === "afternoon" ? "🌇" : "🌙",
    seasonLabel: (sn) =>
      sn === "spring" ? "Primavera" :
      sn === "summer" ? "Verano" :
      sn === "autumn" ? "Otoño" : "Invierno",
    seasonIcon: (sn) =>
      sn === "spring" ? "🌱" :
      sn === "summer" ? "☀️" :
      sn === "autumn" ? "🍂" : "❄️",
    toastSeasonStart: (l) => `Comienza ${l}`,
    catastropheIcon: (k) =>
      k === "quake" ? "🌐" : k === "flood" ? "🌊" : k === "drought" ? "🥵" :
      k === "freeze" ? "🥶" : k === "meteor" ? "☄️" : k === "eruption" ? "🌋" :
      k === "wildfire" ? "🔥" : k === "storm" ? "🌪️" : k === "lightning" ? "⚡" :
      k === "locusts" ? "🦗" : "⛰️",
    toastCatastrophe: (k, sev) => {
      const intensity = sev === 3 ? "Devastador" : sev === 2 ? "Grave" : "Leve";
      const name =
        k === "quake" ? "terremoto" :
        k === "flood" ? "inundación" :
        k === "drought" ? "sequía" :
        k === "freeze" ? "ola de frío" :
        k === "meteor" ? "¡Meteorito en camino!" :
        k === "eruption" ? "erupción volcánica" :
        k === "wildfire" ? "incendio forestal" :
        k === "storm" ? "tormenta" :
        k === "lightning" ? "rayo" :
        k === "locusts" ? "plaga de langostas" : "deslizamiento";
      if (k === "meteor") return `☄️ ${name}`;
      return `${name} ${intensity.toLowerCase()}`;
    },

    rewardNewMember: "un nuevo miembro de la tribu",
    rewardAmount: (k, a) => `${a} ${k}`,

    goTitle: "Tu tribu se ha extinguido",
    goStatistics: "Estadísticas",
    goSurvival: "Tiempo de supervivencia",
    goMaxTribe: "Miembros de la tribu (máx.)",
    goCollectedTotal: "Total recolectado",
    goPoints: "Puntos",
    goResources: "Recursos",
    goLeaderboard: "Clasificación",
    goRestart: "Reiniciar",
    victoryTitle: "¡Victoria! Todas las tribus descienden de la tuya",
    victorySubtitle: "Tu tribu de origen se ha extendido a todos los espacios mediante divisiones.",
    victoryStatTribes: "Tribus de tu origen",
    victoryOtherTitle: (n) => `Victoria de ${n}`,
    victoryOtherSubtitle: (n) => `Todas las tribus activas descienden del origen de ${n}.`,
    lbHeaderRank: "#",
    lbHeaderTribe: "Tribu",
    lbHeaderTime: "Tiempo",
    lbHeaderCollected: "Rec.",
    lbHeaderMembers: "Mie.",
    lbHeaderScore: "Pts.",
    lbLoading: "Cargando clasificación …",
    lbEmpty: "Aún no hay entradas.",
    lbYourRank: (r) => `Tu posición: #${r}`,

    helpTipBerry: "Pasa junto a las bayas y tu tribu las recogerá...",
    helpTipWater: "Necesitas agua para vivir — y también peces… ¡cuidado con los caimanes!",
    helpTipBirth: "¡Un nacimiento! Cuando hombres y mujeres están juntos y hay suficiente comida, tu tribu crece. Cada niño necesita tiempo antes de poder recolectar o cazar por sí solo.",
    helpTipVolcano: "¡Un volcán! Cerca de él tu tribu puede ahorrarse la leña para la hoguera nocturna.",
    helpTipWood: "Madera — tu recurso más importante. Sirve para encender el fuego nocturno y para tallar garrotes y lanzas para la caza.",
    helpTipClub: "Con un garrote de madera puedes cazar animales mucho mejor que con las manos desnudas.",
    helpTipCampfire: "Cada anochecer tu tribu necesita refugio — la hoguera abriga y ahuyenta a las bestias salvajes.",
    helpTipMushroom: "Las setas son comida valiosa — recógelas por el camino.",
    helpTipStone: "Recoge piedras — las necesitas para hacer fuego y también como armas.",
    helpTipSpear: "Con lanzas tu tribu caza animales mucho mejor — para fabricar una lanza necesitas madera y piedra.",
    helpTipTracks: "Al caminar tu tribu deja huellas — así las tribus pueden encontrarse.",
    helpTipStoneHunt: "Tu primera arma: la piedra — úsala para cazar animales.",
    helpEnabled: "Consejos: Activados (h)",
    helpDisabled: "Consejos: Desactivados (h)",

    infoTitle: "Tribu – Resumen",
    infoSectionOverview: "Tribu",
    infoSectionResources: "Reservas",
    infoSeason: "Estación",
    infoPhase: "Momento del día",
    infoSurvival: "Tiempo de supervivencia",
    infoTribeSize: "Miembros de la tribu",
    infoMales: "Hombres",
    infoFemales: "Mujeres",
    infoMaxTribe: "Tamaño máx. de la tribu",
    infoGrowth: "Crecimiento",
    infoCollectedTotal: "Total recolectado",
    infoHint: "i cerrar · h consejos",
  },

  pt: {
    lobbyTitle: "Tribos: caçadores e coletores",
    lobbySubtitle: "Insere o teu nome",
    lobbyPlay: "Jogar",
    lobbyEnterName: "Insere um nome",
    lobbyNamePlaceholder: "O teu nome",
    lobbyConnecting: "A ligar …",
    lobbyError: (m) => `Erro: ${m}`,
    lobbyConnectionLost: "Ligação perdida",
    lobbyChooseLanguage: "Idioma",

    resHolz: "Madeira",
    resWasser: "Água",
    resBeeren: "Bagas",
    resPilze: "Cogumelos",
    resFleisch: "Carne",
    resFisch: "Peixe",
    resStein: "Pedra",
    resKreuter: "Ervas",
    resFelle: "Peles",
    hudTribeMembers: "Membros da tribo",
    hudWaitingForOthers: "À espera de mais tribos …",
    hudYou: "Tu",
    hudTribeOf: (n) => `Tribo de ${n}`,
    hudTribeFallback: (id) => `Tribo ${id}`,

    growthLabel: "Crescimento",
    growthFull: "Tribo cheia",
    growthTooFew: "membros insuficientes",
    growthNoMan: "nenhum homem na tribo",
    growthNoWoman: "nenhuma mulher na tribo",
    growthImminent: "nascimento iminente",
    growthPaused: "em pausa",

    toastBackToTribe: "Voltar à tua tribo",
    toastSpectating: (n) => `A observar: ${n}`,
    toastJoinedTribe: (n) => `A tribo de ${n} juntou-se`,
    toastLeftGame: (n) => `A tribo de ${n} saiu do jogo`,
    toastEncounterWith: (n) => `Encontro com a tribo de ${n}`,
    toastWomenJoinedYouSing: "uma mulher juntou-se a ti",
    toastWomenJoinedYou: (n) => `${n} mulheres juntaram-se a ti`,
    toastWomenLeftYouSing: "uma mulher deixou a tua tribo",
    toastWomenLeftYou: (n) => `${n} mulheres deixaram a tua tribo`,
    toastWomenMovedToSing: (n) => `uma mulher passou para a tribo de ${n}`,
    toastWomenMovedTo: (n, name) => `${n} mulheres passaram para a tribo de ${name}`,
    toastEncounterTribes: (a, b, moves) =>
      `Encontro entre as tribos de ${a} e ${b}: ${moves}`,
    toastEncounterTribesMet: (a, b) =>
      `A tribo de ${a} encontra a tribo de ${b}`,
    toastOwnGrewSing: "A tua tribo cresce: um novo membro juntou-se",
    toastOwnGrew: (n) => `A tua tribo cresce: ${n} novos membros juntaram-se`,
    toastOtherGrewSing: (n) => `A tribo de ${n} cresce: um novo membro`,
    toastOtherGrew: (n, k) => `A tribo de ${n} cresce: ${k} novos membros`,
    toastOwnDiedSing: "Um membro da tua tribo morreu",
    toastOwnDied: (n) => `${n} membros da tua tribo morreram`,
    toastOtherDiedSing: (n) => `Um membro da tribo de ${n} morreu`,
    toastOtherDied: (n, k) => `${k} membros da tribo de ${n} morreram`,
    toastExtinct: (n) => `A tribo de ${n} extinguiu-se`,
    toastTribeFounded: (n) => `A tribo de ${n} foi fundada`,
    toastTribeSplit: (a, b) => `A tribo ${a} cresceu demais — uma parte separa-se e funda a tribo ${b}`,
    toastOwnCampfire: "A tua tribo acendeu uma fogueira",
    toastOtherCampfire: (n) => `A tribo de ${n} acendeu uma fogueira`,
    toastCampfireNotVisible: "Fogueira não visível aqui",
    toastCampfireMissingResources: "Madeira e pedra insuficientes para uma fogueira",
    toastCampfireNotHere: "Aqui não se pode acender uma fogueira",
    toastCampfireTooFar: "Demasiado longe da tribo para uma fogueira",
    toastArtifactOwn: (r) => `Artefacto mítico descoberto! Recompensa: ${r}`,
    toastArtifactOther: (n, r) =>
      `A tribo de ${n} descobriu um artefacto mítico (${r})`,
    toastNightfall: "Cai a noite – juntem-se em torno da fogueira!",
    toastSunriseSafe: "Nascer do sol – a tua tribo sobreviveu à noite",
    toastSunriseLost: (s) => `Nascer do sol – ${s}`,
    phaseLabel: (p) =>
      p === "morning" ? "Manhã" :
      p === "noon" ? "Meio-dia" :
      p === "afternoon" ? "Tarde" : "Noite",
    phaseIcon: (p) =>
      p === "morning" ? "🌅" :
      p === "noon" ? "☀️" :
      p === "afternoon" ? "🌇" : "🌙",
    seasonLabel: (sn) =>
      sn === "spring" ? "Primavera" :
      sn === "summer" ? "Verão" :
      sn === "autumn" ? "Outono" : "Inverno",
    seasonIcon: (sn) =>
      sn === "spring" ? "🌱" :
      sn === "summer" ? "☀️" :
      sn === "autumn" ? "🍂" : "❄️",
    toastSeasonStart: (l) => `Começa ${l}`,
    catastropheIcon: (k) =>
      k === "quake" ? "🌐" : k === "flood" ? "🌊" : k === "drought" ? "🥵" :
      k === "freeze" ? "🥶" : k === "meteor" ? "☄️" : k === "eruption" ? "🌋" :
      k === "wildfire" ? "🔥" : k === "storm" ? "🌪️" : k === "lightning" ? "⚡" :
      k === "locusts" ? "🦗" : "⛰️",
    toastCatastrophe: (k, sev) => {
      const intensity = sev === 3 ? "Devastador" : sev === 2 ? "Grave" : "Leve";
      const name =
        k === "quake" ? "terremoto" :
        k === "flood" ? "enchente" :
        k === "drought" ? "seca" :
        k === "freeze" ? "onda de frio" :
        k === "meteor" ? "Meteoro a caminho!" :
        k === "eruption" ? "erupção vulcânica" :
        k === "wildfire" ? "incêndio florestal" :
        k === "storm" ? "tempestade" :
        k === "lightning" ? "raio" :
        k === "locusts" ? "praga de gafanhotos" : "deslizamento";
      if (k === "meteor") return `☄️ ${name}`;
      return `${name} ${intensity.toLowerCase()}`;
    },

    rewardNewMember: "um novo membro da tribo",
    rewardAmount: (k, a) => `${a} ${k}`,

    goTitle: "A tua tribo extinguiu-se",
    goStatistics: "Estatísticas",
    goSurvival: "Tempo de sobrevivência",
    goMaxTribe: "Membros da tribo (máx.)",
    goCollectedTotal: "Total recolhido",
    goPoints: "Pontos",
    goResources: "Recursos",
    goLeaderboard: "Classificação",
    goRestart: "Recomeçar",
    victoryTitle: "Vitória! Todas as tribos descendem da tua",
    victorySubtitle: "A tua tribo de origem espalhou-se por todos os lugares através de divisões.",
    victoryStatTribes: "Tribos da tua origem",
    victoryOtherTitle: (n) => `Vitória de ${n}`,
    victoryOtherSubtitle: (n) => `Todas as tribos ativas descendem da origem de ${n}.`,
    lbHeaderRank: "#",
    lbHeaderTribe: "Tribo",
    lbHeaderTime: "Tempo",
    lbHeaderCollected: "Rec.",
    lbHeaderMembers: "Mem.",
    lbHeaderScore: "Pts.",
    lbLoading: "A carregar classificação …",
    lbEmpty: "Ainda sem entradas.",
    lbYourRank: (r) => `A tua posição: #${r}`,

    helpTipBerry: "Passa pelas bagas e a tua tribo irá recolhê-las...",
    helpTipWater: "Precisas de água para viver — e também de peixes… cuidado com os jacarés!",
    helpTipBirth: "Um nascimento! Quando homens e mulheres estão juntos e há comida suficiente, a tua tribo cresce. Cada criança precisa de tempo antes de poder colher ou caçar sozinha.",
    helpTipVolcano: "Um vulcão! Por perto, a tua tribo pode poupar a lenha para a fogueira noturna.",
    helpTipWood: "Madeira — o teu recurso mais importante. Serve para acender a fogueira noturna e para talhar maças e lanças para a caça.",
    helpTipClub: "Com uma maça de madeira consegues caçar animais muito melhor do que com as mãos nuas.",
    helpTipCampfire: "Toda noite a tua tribo precisa de abrigo — a fogueira aquece e afasta os animais selvagens.",
    helpTipMushroom: "Os cogumelos são alimento valioso — apanha-os pelo caminho.",
    helpTipStone: "Recolhe pedras — precisas delas para fazer fogo e também como armas.",
    helpTipSpear: "Com lanças a tua tribo caça muito melhor — para fazer uma lança precisas de madeira e pedra.",
    helpTipTracks: "Ao caminhar a tua tribo deixa pegadas — é assim que as tribos se encontram.",
    helpTipStoneHunt: "A tua primeira arma: a pedra — usa-a para caçar animais.",
    helpEnabled: "Sugestões: Ativadas (h)",
    helpDisabled: "Sugestões: Desativadas (h)",

    infoTitle: "Tribo – Resumo",
    infoSectionOverview: "Tribo",
    infoSectionResources: "Reservas",
    infoSeason: "Estação",
    infoPhase: "Hora do dia",
    infoSurvival: "Tempo de sobrevivência",
    infoTribeSize: "Membros da tribo",
    infoMales: "Homens",
    infoFemales: "Mulheres",
    infoMaxTribe: "Tamanho máx. da tribo",
    infoGrowth: "Crescimento",
    infoCollectedTotal: "Total recolhido",
    infoHint: "i fechar · h sugestões",
  },

  fr: {
    lobbyTitle: "Tribus : chasseurs et cueilleurs",
    lobbySubtitle: "Entre ton nom",
    lobbyPlay: "Jouer",
    lobbyEnterName: "Veuillez entrer un nom",
    lobbyNamePlaceholder: "Ton nom",
    lobbyConnecting: "Connexion …",
    lobbyError: (m) => `Erreur : ${m}`,
    lobbyConnectionLost: "Connexion perdue",
    lobbyChooseLanguage: "Langue",

    resHolz: "Bois",
    resWasser: "Eau",
    resBeeren: "Baies",
    resPilze: "Champignons",
    resFleisch: "Viande",
    resFisch: "Poisson",
    resStein: "Pierre",
    resKreuter: "Herbes",
    resFelle: "Peaux",
    hudTribeMembers: "Membres de la tribu",
    hudWaitingForOthers: "En attente d'autres tribus …",
    hudYou: "Toi",
    hudTribeOf: (n) => `Tribu de ${n}`,
    hudTribeFallback: (id) => `Tribu ${id}`,

    growthLabel: "Croissance",
    growthFull: "Tribu complète",
    growthTooFew: "trop peu de membres",
    growthNoMan: "aucun homme dans la tribu",
    growthNoWoman: "aucune femme dans la tribu",
    growthImminent: "naissance imminente",
    growthPaused: "en pause",

    toastBackToTribe: "Retour à ta tribu",
    toastSpectating: (n) => `Tu observes : ${n}`,
    toastJoinedTribe: (n) => `La tribu de ${n} a rejoint la partie`,
    toastLeftGame: (n) => `La tribu de ${n} a quitté la partie`,
    toastEncounterWith: (n) => `Rencontre avec la tribu de ${n}`,
    toastWomenJoinedYouSing: "une femme t'a rejoint",
    toastWomenJoinedYou: (n) => `${n} femmes t'ont rejoint`,
    toastWomenLeftYouSing: "une femme a quitté ta tribu",
    toastWomenLeftYou: (n) => `${n} femmes ont quitté ta tribu`,
    toastWomenMovedToSing: (n) => `une femme a rejoint la tribu de ${n}`,
    toastWomenMovedTo: (n, name) => `${n} femmes ont rejoint la tribu de ${name}`,
    toastEncounterTribes: (a, b, moves) =>
      `Rencontre entre les tribus de ${a} et ${b} : ${moves}`,
    toastEncounterTribesMet: (a, b) =>
      `La tribu de ${a} rencontre la tribu de ${b}`,
    toastOwnGrewSing: "Ta tribu grandit : un nouveau membre est arrivé",
    toastOwnGrew: (n) => `Ta tribu grandit : ${n} nouveaux membres sont arrivés`,
    toastOtherGrewSing: (n) => `La tribu de ${n} grandit : un nouveau membre`,
    toastOtherGrew: (n, k) => `La tribu de ${n} grandit : ${k} nouveaux membres`,
    toastOwnDiedSing: "Un membre de ta tribu est mort",
    toastOwnDied: (n) => `${n} membres de ta tribu sont morts`,
    toastOtherDiedSing: (n) => `Un membre de la tribu de ${n} est mort`,
    toastOtherDied: (n, k) => `${k} membres de la tribu de ${n} sont morts`,
    toastExtinct: (n) => `La tribu de ${n} s'est éteinte`,
    toastTribeFounded: (n) => `La tribu de ${n} a été fondée`,
    toastTribeSplit: (a, b) => `La tribu ${a} est devenue trop grande — une partie se sépare et fonde la tribu ${b}`,
    toastOwnCampfire: "Ta tribu a allumé un feu de camp",
    toastOtherCampfire: (n) => `La tribu de ${n} a allumé un feu de camp`,
    toastCampfireNotVisible: "Feu de camp non visible ici",
    toastCampfireMissingResources: "Pas assez de bois et de pierre pour un feu de camp",
    toastCampfireNotHere: "Impossible d'allumer un feu de camp ici",
    toastCampfireTooFar: "Trop loin de ta tribu pour un feu de camp",
    toastArtifactOwn: (r) => `Artefact mythique découvert ! Récompense : ${r}`,
    toastArtifactOther: (n, r) =>
      `La tribu de ${n} a découvert un artefact mythique (${r})`,
    toastNightfall: "La nuit tombe – rassemblez-vous autour du feu !",
    toastSunriseSafe: "Lever du soleil – ta tribu a survécu à la nuit",
    toastSunriseLost: (s) => `Lever du soleil – ${s}`,
    phaseLabel: (p) =>
      p === "morning" ? "Matin" :
      p === "noon" ? "Midi" :
      p === "afternoon" ? "Après-midi" : "Nuit",
    phaseIcon: (p) =>
      p === "morning" ? "🌅" :
      p === "noon" ? "☀️" :
      p === "afternoon" ? "🌇" : "🌙",
    seasonLabel: (sn) =>
      sn === "spring" ? "Printemps" :
      sn === "summer" ? "Été" :
      sn === "autumn" ? "Automne" : "Hiver",
    seasonIcon: (sn) =>
      sn === "spring" ? "🌱" :
      sn === "summer" ? "☀️" :
      sn === "autumn" ? "🍂" : "❄️",
    toastSeasonStart: (l) => `${l} commence`,
    catastropheIcon: (k) =>
      k === "quake" ? "🌐" : k === "flood" ? "🌊" : k === "drought" ? "🥵" :
      k === "freeze" ? "🥶" : k === "meteor" ? "☄️" : k === "eruption" ? "🌋" :
      k === "wildfire" ? "🔥" : k === "storm" ? "🌪️" : k === "lightning" ? "⚡" :
      k === "locusts" ? "🦗" : "⛰️",
    toastCatastrophe: (k, sev) => {
      const intensity = sev === 3 ? "Dévastateur" : sev === 2 ? "Grave" : "Léger";
      const name =
        k === "quake" ? "séisme" :
        k === "flood" ? "inondation" :
        k === "drought" ? "sécheresse" :
        k === "freeze" ? "vague de froid" :
        k === "meteor" ? "Météorite en approche !" :
        k === "eruption" ? "éruption volcanique" :
        k === "wildfire" ? "feu de forêt" :
        k === "storm" ? "tempête" :
        k === "lightning" ? "foudre" :
        k === "locusts" ? "nuée de criquets" : "glissement de terrain";
      if (k === "meteor") return `☄️ ${name}`;
      return `${name} ${intensity.toLowerCase()}`;
    },

    rewardNewMember: "un nouveau membre de la tribu",
    rewardAmount: (k, a) => `${a} ${k}`,

    goTitle: "Ta tribu s'est éteinte",
    goStatistics: "Statistiques",
    goSurvival: "Temps de survie",
    goMaxTribe: "Membres de la tribu (max.)",
    goCollectedTotal: "Total récolté",
    goPoints: "Score",
    goResources: "Ressources",
    goLeaderboard: "Classement",
    goRestart: "Recommencer",
    victoryTitle: "Victoire ! Toutes les tribus descendent de la tienne",
    victorySubtitle: "Ta tribu d'origine s'est répandue dans tous les emplacements par scission.",
    victoryStatTribes: "Tribus de ton origine",
    victoryOtherTitle: (n) => `Victoire pour ${n}`,
    victoryOtherSubtitle: (n) => `Toutes les tribus actives descendent de l'origine de ${n}.`,
    lbHeaderRank: "#",
    lbHeaderTribe: "Tribu",
    lbHeaderTime: "Temps",
    lbHeaderCollected: "Réc.",
    lbHeaderMembers: "Mem.",
    lbHeaderScore: "Pts.",
    lbLoading: "Chargement du classement …",
    lbEmpty: "Aucune entrée pour l'instant.",
    lbYourRank: (r) => `Ta position : #${r}`,

    helpTipBerry: "Passe à côté des baies et ta tribu les ramassera...",
    helpTipWater: "Tu as besoin d'eau pour vivre — et de poissons aussi… attention aux alligators !",
    helpTipBirth: "Une naissance ! Quand hommes et femmes sont ensemble et qu'il y a assez de nourriture, ta tribu grandit. Chaque enfant a besoin de temps avant de pouvoir cueillir ou chasser seul.",
    helpTipVolcano: "Un volcan ! À proximité, ta tribu peut économiser le bois du feu de camp nocturne.",
    helpTipWood: "Bois — votre ressource la plus précieuse. Il sert à allumer le feu de la nuit et à tailler gourdins et lances pour la chasse.",
    helpTipClub: "Avec un gourdin en bois, tu chasses les animaux bien mieux qu'à mains nues.",
    helpTipCampfire: "Chaque soir, ta tribu a besoin d'abri — le feu de camp réchauffe et fait fuir les bêtes sauvages.",
    helpTipMushroom: "Les champignons sont une nourriture précieuse — ramasse-les en chemin.",
    helpTipStone: "Ramasse des pierres — il t'en faut pour faire du feu et comme armes.",
    helpTipSpear: "Avec des lances, ta tribu chasse bien mieux — pour fabriquer une lance, il faut du bois et de la pierre.",
    helpTipTracks: "En marchant, ta tribu laisse des traces — c'est ainsi que les tribus se trouvent.",
    helpTipStoneHunt: "Ta première arme : la pierre — utilise-la pour chasser les animaux.",
    helpEnabled: "Astuces : Activées (h)",
    helpDisabled: "Astuces : Désactivées (h)",

    infoTitle: "Tribu – Aperçu",
    infoSectionOverview: "Tribu",
    infoSectionResources: "Réserves",
    infoSeason: "Saison",
    infoPhase: "Moment de la journée",
    infoSurvival: "Temps de survie",
    infoTribeSize: "Membres de la tribu",
    infoMales: "Hommes",
    infoFemales: "Femmes",
    infoMaxTribe: "Taille max. de la tribu",
    infoGrowth: "Croissance",
    infoCollectedTotal: "Total récolté",
    infoHint: "i fermer · h astuces",
  },
};

const STORAGE_KEY = "rts-language";

export function isLanguage(s: unknown): s is Language {
  return typeof s === "string" && (LANGUAGES as readonly string[]).includes(s);
}

export function detectBrowserLanguage(): Language {
  const candidates: string[] = [];
  if (typeof navigator !== "undefined") {
    if (Array.isArray(navigator.languages)) candidates.push(...navigator.languages);
    if (navigator.language) candidates.push(navigator.language);
  }
  for (const c of candidates) {
    const base = c.toLowerCase().split(/[-_]/)[0];
    if (isLanguage(base)) return base;
  }
  return "en";
}

export function loadStoredLanguage(): Language | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return isLanguage(v) ? v : null;
  } catch {
    return null;
  }
}

export function storeLanguage(lang: Language): void {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // ignore
  }
}

let current: Language = loadStoredLanguage() ?? detectBrowserLanguage();

export function getLanguage(): Language {
  return current;
}

export function setLanguage(lang: Language): void {
  current = lang;
  storeLanguage(lang);
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("lang", lang);
  }
}

export function t(): Strings {
  return STRINGS[current];
}

export function tFor(lang: Language): Strings {
  return STRINGS[lang];
}
