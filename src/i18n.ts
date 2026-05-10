import { Language, LANGUAGES } from "../shared/names";

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
  lbHeaderRank: string;
  lbHeaderTribe: string;
  lbHeaderTime: string;
  lbHeaderCollected: string;
  lbHeaderMembers: string;
  lbHeaderScore: string;
  lbLoading: string;
  lbEmpty: string;
  lbYourRank: (rank: number) => string;
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
    lbHeaderRank: "#",
    lbHeaderTribe: "Stamm",
    lbHeaderTime: "Zeit",
    lbHeaderCollected: "Sml.",
    lbHeaderMembers: "Mitg.",
    lbHeaderScore: "Pkt.",
    lbLoading: "Bestenliste lädt …",
    lbEmpty: "Noch keine Einträge.",
    lbYourRank: (r) => `Dein Platz: #${r}`,
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
    lbHeaderRank: "#",
    lbHeaderTribe: "Tribe",
    lbHeaderTime: "Time",
    lbHeaderCollected: "Coll.",
    lbHeaderMembers: "Mem.",
    lbHeaderScore: "Pts.",
    lbLoading: "Loading leaderboard …",
    lbEmpty: "No entries yet.",
    lbYourRank: (r) => `Your rank: #${r}`,
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
    lbHeaderRank: "#",
    lbHeaderTribe: "Tribù",
    lbHeaderTime: "Tempo",
    lbHeaderCollected: "Racc.",
    lbHeaderMembers: "Mem.",
    lbHeaderScore: "Pti.",
    lbLoading: "Caricamento classifica …",
    lbEmpty: "Ancora nessuna voce.",
    lbYourRank: (r) => `La tua posizione: #${r}`,
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
    lbHeaderRank: "#",
    lbHeaderTribe: "Tribu",
    lbHeaderTime: "Tiempo",
    lbHeaderCollected: "Rec.",
    lbHeaderMembers: "Mie.",
    lbHeaderScore: "Pts.",
    lbLoading: "Cargando clasificación …",
    lbEmpty: "Aún no hay entradas.",
    lbYourRank: (r) => `Tu posición: #${r}`,
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
    lbHeaderRank: "#",
    lbHeaderTribe: "Tribo",
    lbHeaderTime: "Tempo",
    lbHeaderCollected: "Rec.",
    lbHeaderMembers: "Mem.",
    lbHeaderScore: "Pts.",
    lbLoading: "A carregar classificação …",
    lbEmpty: "Ainda sem entradas.",
    lbYourRank: (r) => `A tua posição: #${r}`,
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
    lbHeaderRank: "#",
    lbHeaderTribe: "Tribu",
    lbHeaderTime: "Temps",
    lbHeaderCollected: "Réc.",
    lbHeaderMembers: "Mem.",
    lbHeaderScore: "Pts.",
    lbLoading: "Chargement du classement …",
    lbEmpty: "Aucune entrée pour l'instant.",
    lbYourRank: (r) => `Ta position : #${r}`,
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
