import { UnitGender } from "./protocol";

export type Language = "de" | "es" | "fr" | "it" | "en" | "pt";

export type NameLanguage = Language | "sv" | "el" | "ru" | "pl";

export const LANGUAGES: Language[] = ["de", "es", "fr", "it", "en", "pt"];

export const NAME_LANGUAGES: NameLanguage[] = [
  ...LANGUAGES,
  "sv",
  "el",
  "ru",
  "pl",
];

export const LANGUAGE_LABEL: Record<NameLanguage, string> = {
  de: "Deutsch",
  es: "Spanisch",
  fr: "Französisch",
  it: "Italienisch",
  en: "Englisch",
  pt: "Portugiesisch",
  sv: "Schwedisch",
  el: "Griechisch",
  ru: "Russisch",
  pl: "Polnisch",
};

export const LANGUAGE_FLAG: Record<NameLanguage, string> = {
  de: "🇩🇪",
  es: "🇪🇸",
  fr: "🇫🇷",
  it: "🇮🇹",
  en: "🇬🇧",
  pt: "🇵🇹",
  sv: "🇸🇪",
  el: "🇬🇷",
  ru: "🇷🇺",
  pl: "🇵🇱",
};

interface NamePool {
  m: string[];
  f: string[];
}

export const NAMES: Record<NameLanguage, NamePool> = {
  de: {
    m: [
      "Hans", "Karl", "Wilhelm", "Friedrich", "Heinrich",
      "Otto", "Klaus", "Werner", "Gerhard", "Manfred",
      "Jürgen", "Helmut", "Dieter", "Wolfgang", "Kurt",
      "Horst", "Gunther", "Lothar", "Bernd", "Ulrich",
      "Rainer", "Egon", "Reinhard", "Volker", "Siegfried",
    ],
    f: [
      "Ingrid", "Helga", "Brunhilde", "Gertrud", "Gisela",
      "Erika", "Hannelore", "Ursula", "Renate", "Monika",
      "Karin", "Petra", "Sabine", "Birgit", "Gudrun",
      "Hilde", "Marlene", "Heidi", "Astrid", "Doris",
      "Bärbel", "Anneliese", "Edith", "Sigrid", "Mathilde",
    ],
  },
  es: {
    m: [
      "Diego", "Carlos", "Miguel", "Juan", "Pedro",
      "Antonio", "Javier", "Ramón", "Felipe", "Andrés",
      "Fernando", "Pablo", "Rafael", "Alejandro", "Hugo",
      "Gonzalo", "Tomás", "Sergio", "Manuel", "Lucas",
      "Esteban", "Mateo", "Iván", "Rodrigo", "Adrián",
    ],
    f: [
      "María", "Sofía", "Lucía", "Carmen", "Isabel",
      "Pilar", "Esperanza", "Rosa", "Elena", "Mercedes",
      "Paloma", "Inés", "Gabriela", "Beatriz", "Alba",
      "Marta", "Andrea", "Camila", "Paula", "Valeria",
      "Daniela", "Laura", "Adriana", "Patricia", "Ximena",
    ],
  },
  fr: {
    m: [
      "Pierre", "Jean", "Louis", "François", "Henri",
      "Marcel", "René", "Philippe", "Étienne", "Bernard",
      "Olivier", "Gérard", "Jacques", "Michel", "Antoine",
      "Vincent", "Hugo", "Émile", "Lucien", "Albert",
      "Raymond", "Roger", "Alain", "Maurice", "Thierry",
    ],
    f: [
      "Marie", "Camille", "Élise", "Juliette", "Léa",
      "Margot", "Aurélie", "Adèle", "Céline", "Sophie",
      "Chantal", "Béatrice", "Hélène", "Anaïs", "Charlotte",
      "Manon", "Noémie", "Brigitte", "Pauline", "Yvonne",
      "Virginie", "Florence", "Mireille", "Solange", "Estelle",
    ],
  },
  it: {
    m: [
      "Marco", "Luca", "Giovanni", "Antonio", "Giuseppe",
      "Francesco", "Lorenzo", "Salvatore", "Pietro", "Alessandro",
      "Matteo", "Vincenzo", "Federico", "Andrea", "Roberto",
      "Stefano", "Gabriele", "Riccardo", "Davide", "Tommaso",
      "Cesare", "Enrico", "Bruno", "Carlo", "Massimo",
    ],
    f: [
      "Giulia", "Sofia", "Aurora", "Chiara", "Alessia",
      "Valentina", "Francesca", "Martina", "Beatrice", "Elisabetta",
      "Caterina", "Eleonora", "Federica", "Silvia", "Lucia",
      "Paola", "Giada", "Camilla", "Stella", "Antonella",
      "Roberta", "Greta", "Bianca", "Donatella", "Serena",
    ],
  },
  en: {
    m: [
      "William", "James", "Henry", "Edward", "George",
      "Thomas", "Charles", "Arthur", "Walter", "Frederick",
      "Albert", "Benjamin", "Oliver", "Samuel", "Joseph",
      "Daniel", "Andrew", "Christopher", "Patrick", "Nathaniel",
      "Robert", "Michael", "Stephen", "Timothy", "Vincent",
    ],
    f: [
      "Mary", "Elizabeth", "Margaret", "Catherine", "Anne",
      "Sarah", "Emily", "Charlotte", "Alice", "Beatrice",
      "Florence", "Eleanor", "Helen", "Victoria", "Caroline",
      "Lydia", "Harriet", "Penelope", "Olivia", "Edith",
      "Joanne", "Rose", "Jane", "Lillian", "Diana",
    ],
  },
  pt: {
    m: [
      "João", "Pedro", "Tiago", "Manuel", "António",
      "Rui", "Diogo", "Bruno", "Ricardo", "Miguel",
      "Filipe", "Hugo", "Vasco", "Bernardo", "Henrique",
      "Afonso", "Duarte", "Gonçalo", "Tomás", "Joaquim",
      "Eduardo", "Fernando", "Rodrigo", "Inácio", "Salvador",
    ],
    f: [
      "Maria", "Ana", "Joana", "Beatriz", "Catarina",
      "Mariana", "Inês", "Carolina", "Sofia", "Margarida",
      "Leonor", "Matilde", "Constança", "Isabel", "Filipa",
      "Patrícia", "Helena", "Cristina", "Teresa", "Lúcia",
      "Madalena", "Rita", "Bárbara", "Diana", "Clara",
    ],
  },
  sv: {
    m: [
      "Erik", "Sven", "Lars", "Olof", "Björn",
      "Anders", "Gustav", "Per", "Nils", "Magnus",
      "Knut", "Stig", "Ulf", "Ragnar", "Harald",
      "Sigurd", "Torsten", "Holger", "Einar", "Hjalmar",
      "Folke", "Arvid", "Mats", "Sune", "Bo",
    ],
    f: [
      "Astrid", "Ingrid", "Sigrid", "Greta", "Linnea",
      "Kerstin", "Britta", "Margit", "Elsa", "Karin",
      "Maja", "Saga", "Freja", "Ebba", "Hilda",
      "Tova", "Ylva", "Gunilla", "Inga", "Solveig",
      "Birgitta", "Vilma", "Stina", "Ronja", "Annika",
    ],
  },
  el: {
    m: [
      "Δημήτριος", "Νικόλαος", "Γεώργιος", "Κωνσταντίνος", "Αλέξανδρος",
      "Ιωάννης", "Παναγιώτης", "Στέφανος", "Χρήστος", "Ανδρέας",
      "Πέτρος", "Θεόδωρος", "Λεωνίδας", "Ηλίας", "Σπυρίδων",
      "Βασίλειος", "Μιχαήλ", "Φίλιππος", "Αναστάσιος", "Λάμπρος",
      "Ευάγγελος", "Ορέστης", "Παύλος", "Αχιλλέας", "Θησέας",
    ],
    f: [
      "Μαρία", "Ελένη", "Σοφία", "Αικατερίνη", "Δέσποινα",
      "Παναγιώτα", "Γεωργία", "Ελευθερία", "Αναστασία", "Ευαγγελία",
      "Δήμητρα", "Άρτεμις", "Καλλιόπη", "Φωτεινή", "Ολυμπία",
      "Ευδοκία", "Θεοδώρα", "Στέλλα", "Ζωή", "Ευτυχία",
      "Αθηνά", "Ιφιγένεια", "Ασπασία", "Ευρυδίκη", "Χρυσούλα",
    ],
  },
  ru: {
    m: [
      "Иван", "Алексей", "Николай", "Дмитрий", "Сергей",
      "Владимир", "Михаил", "Андрей", "Виктор", "Борис",
      "Юрий", "Олег", "Павел", "Игорь", "Степан",
      "Фёдор", "Василий", "Григорий", "Антон", "Максим",
      "Леонид", "Вячеслав", "Аркадий", "Тимофей", "Святослав",
    ],
    f: [
      "Ольга", "Елена", "Татьяна", "Ирина", "Наталья",
      "Мария", "Светлана", "Любовь", "Анна", "Екатерина",
      "Галина", "Людмила", "Зинаида", "Валентина", "Надежда",
      "Ксения", "Полина", "Дарья", "Алёна", "Аглая",
      "Раиса", "Лариса", "Софья", "Антонина", "Вера",
    ],
  },
  pl: {
    m: [
      "Jan", "Piotr", "Krzysztof", "Andrzej", "Stanisław",
      "Tomasz", "Paweł", "Marek", "Jakub", "Wojciech",
      "Tadeusz", "Mateusz", "Mikołaj", "Zbigniew", "Henryk",
      "Kazimierz", "Władysław", "Leszek", "Bartosz", "Łukasz",
      "Filip", "Maciej", "Sławomir", "Dariusz", "Eryk",
    ],
    f: [
      "Anna", "Maria", "Katarzyna", "Małgorzata", "Agnieszka",
      "Krystyna", "Barbara", "Ewa", "Elżbieta", "Zofia",
      "Halina", "Jadwiga", "Wanda", "Magdalena", "Jolanta",
      "Aleksandra", "Marta", "Karolina", "Iwona", "Beata",
      "Bożena", "Łucja", "Stanisława", "Joanna", "Helena",
    ],
  },
};

function mix32(seed: number, a: number, b: number): number {
  let h = (seed ^ 0x9e3779b1) >>> 0;
  h = (Math.imul(h ^ a, 0x85ebca6b) >>> 0);
  h = (Math.imul(h ^ b, 0xc2b2ae35) >>> 0);
  h = (h ^ (h >>> 16)) >>> 0;
  return h;
}

export function pickFirstName(
  seed: number,
  language: NameLanguage,
  gender: UnitGender,
  slot: number,
  idx: number,
  used?: ReadonlySet<string>,
): string {
  const pool = NAMES[language][gender];
  const h = mix32(seed, slot * 7919 + idx, gender === "m" ? 0xa11ce : 0xb0b);
  const start = h % pool.length;
  if (used && used.size > 0) {
    for (let i = 0; i < pool.length; i++) {
      const candidate = pool[(start + i) % pool.length];
      if (!used.has(candidate)) return candidate;
    }
    const base = pool[start];
    for (let n = 2; n < 1000; n++) {
      const candidate = `${base} ${n}`;
      if (!used.has(candidate)) return candidate;
    }
  }
  return pool[start];
}

export function languageForSlot(seed: number, slot: number): NameLanguage {
  const h = mix32(seed, slot, 0x1a4e9);
  return NAME_LANGUAGES[h % NAME_LANGUAGES.length];
}
