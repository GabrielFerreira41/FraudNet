// Synthetic data for FraudNet dashboard
// Accounts (templates), merchants, transaction stream, fraud scenarios

const FIRST_NAMES = ["Amélie","Gabriel","Sophie","Étienne","Chloé","Nathan","Léa","Marc","Juliette","Thomas","Camille","Olivier","Noémie","Hugo","Rose","Félix","Zoé","Samuel","Maëlle","Antoine"];
const LAST_NAMES = ["Tremblay","Gagnon","Roy","Côté","Bouchard","Gauthier","Morin","Lavoie","Fortin","Bergeron","Pelletier","Caron","Cloutier","Dubois","Lefebvre","Girard","Poirier","Leblanc","Ouellet","Mercier"];
const CITIES = ["Montréal","Québec","Laval","Gatineau","Sherbrooke","Trois-Rivières","Saguenay","Longueuil","Lévis","Terrebonne"];
const MERCHANTS_BY_CAT = {
  groceries: ["Metro","IGA","Provigo","Maxi","Super C","Loblaws"],
  coffee: ["Tim Hortons","Starbucks","Second Cup","Café Olimpico"],
  gas: ["Petro-Canada","Esso","Shell","Couche-Tard"],
  online: ["Amazon.ca","Best Buy","Apple","Netflix","Spotify"],
  restaurants: ["La Banquise","Schwartz's","St-Hubert","Boustan","Foodora"],
  transit: ["STM","Uber","Lyft","Via Rail","Bixi"],
  utilities: ["Hydro-Québec","Vidéotron","Bell","Rogers","Telus"],
  transfers: ["Interac","Wise","PayPal"],
  suspicious: ["GiftCardHub","CryptoExchange-X","QuickCashATM","UnknownMerchant-998","Payee-TEMP-44"]
};

const PROFILE_TYPES = [
  { key: "student", label: "Étudiant", icon: "🎓", revenuRange: [800, 1800], avgTxn: 28, freqDay: 3.5, hours: [8,23], cities: ["Montréal","Québec","Sherbrooke"], prefCat: ["coffee","groceries","online","transit","restaurants"] },
  { key: "young_pro", label: "Jeune actif", icon: "💼", revenuRange: [3200, 5500], avgTxn: 62, freqDay: 4.2, hours: [7,23], cities: ["Montréal","Laval","Longueuil"], prefCat: ["groceries","restaurants","online","transit","coffee"] },
  { key: "family", label: "Famille", icon: "👨‍👩‍👧", revenuRange: [5500, 10500], avgTxn: 94, freqDay: 5.1, hours: [6,22], cities: ["Laval","Longueuil","Terrebonne","Lévis"], prefCat: ["groceries","gas","utilities","restaurants","online"] },
  { key: "retiree", label: "Retraité", icon: "🌿", revenuRange: [2400, 4200], avgTxn: 42, freqDay: 2.1, hours: [8,20], cities: ["Québec","Sherbrooke","Trois-Rivières"], prefCat: ["groceries","utilities","restaurants"] },
  { key: "business", label: "Entreprise", icon: "🏢", revenuRange: [15000, 60000], avgTxn: 380, freqDay: 8.4, hours: [8,19], cities: ["Montréal","Québec"], prefCat: ["transfers","utilities","online","gas"] }
];

const FRAUD_SCENARIOS = [
  { key: "stolen_card", label: "Carte volée", color: "scarlet", difficulty: "Moyenne" },
  { key: "card_testing", label: "Test de carte", color: "amber", difficulty: "Faible" },
  { key: "account_takeover", label: "Prise de compte", color: "scarlet", difficulty: "Moyenne" },
  { key: "mule_network", label: "Réseau de mules", color: "violet", difficulty: "Élevée" },
  { key: "structuring", label: "Structuration", color: "violet", difficulty: "Élevée" },
  { key: "wire_fraud", label: "Fraude au virement", color: "scarlet", difficulty: "Très élevée" },
  { key: "mobile_pay", label: "Paiement mobile", color: "amber", difficulty: "Élevée" }
];

// Seeded RNG so the "live" demo is reproducible-ish
let seed = 42;
function rng() { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }
function pick(arr) { return arr[Math.floor(rng() * arr.length)]; }
function pickWeighted(arr, weights) {
  const total = weights.reduce((a,b)=>a+b,0);
  let r = rng() * total;
  for (let i=0;i<arr.length;i++) { r -= weights[i]; if (r<=0) return arr[i]; }
  return arr[arr.length-1];
}
function gauss(mean, std) {
  const u = Math.max(1e-9, rng()), v = rng();
  return mean + std * Math.sqrt(-2*Math.log(u)) * Math.cos(2*Math.PI*v);
}
function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
function round2(x) { return Math.round(x*100)/100; }

// --- generate accounts ---
function generateAccounts(n = 24) {
  const accounts = [];
  for (let i = 0; i < n; i++) {
    const p = pick(PROFILE_TYPES);
    const firstName = pick(FIRST_NAMES);
    const lastName = pick(LAST_NAMES);
    const revenu = Math.round(p.revenuRange[0] + rng() * (p.revenuRange[1] - p.revenuRange[0]));
    const city = pick(p.cities);
    const balance = Math.round(revenu * (0.2 + rng()*3.5));
    // pre-build habitual merchants
    const habitual = [];
    for (const cat of p.prefCat) {
      const m = pick(MERCHANTS_BY_CAT[cat]);
      if (!habitual.find(h=>h.name===m)) habitual.push({ name: m, cat });
    }
    accounts.push({
      id: "AC-" + String(100000 + i * 37 + Math.floor(rng()*100)).slice(0,6),
      name: `${firstName} ${lastName}`,
      initials: (firstName[0] + lastName[0]).toUpperCase(),
      profile: p.key,
      profileLabel: p.label,
      profileIcon: p.icon,
      city,
      revenu,
      avgTxn: p.avgTxn,
      balance,
      hours: p.hours,
      habitualMerchants: habitual,
      riskScore: Math.round(rng() * 18), // base idle risk 0-18
      flagged: false,
      txnCount7d: Math.floor(p.freqDay * 7 + gauss(0, 3)),
      blockedCount: 0,
      savedAmount: 0,
      openedDate: new Date(2020 + Math.floor(rng()*5), Math.floor(rng()*12), 1+Math.floor(rng()*27)).toISOString().slice(0,10)
    });
  }
  return accounts;
}

// --- generate a single transaction ---
let txnCounter = 0;
function generateTransaction(account, now, forceFraud = null) {
  const profile = PROFILE_TYPES.find(p => p.key === account.profile);
  let merchantCat, merchantName, amount, city, device, hour, fraudType = null, isFraud = false, riskFactors = [];

  const date = new Date(now);
  hour = date.getHours();

  // pick fraud or legitimate
  const fraudRoll = rng();
  const shouldBeFraud = forceFraud || (fraudRoll < 0.035); // ~3.5%
  const chosenFraud = forceFraud || (shouldBeFraud ? pick(FRAUD_SCENARIOS).key : null);

  if (chosenFraud) {
    isFraud = true;
    fraudType = chosenFraud;
    switch (chosenFraud) {
      case "stolen_card":
        merchantCat = "suspicious";
        merchantName = pick(MERCHANTS_BY_CAT.suspicious);
        amount = Math.round(account.avgTxn * (6 + rng()*12));
        city = pick(["Toronto","Vancouver","Miami","Los Angeles","Lagos"]);
        device = "device-unknown-" + Math.floor(rng()*9999);
        riskFactors = ["Commerçant inhabituel","Montant 8x la moyenne","Géolocalisation hors-norme","Nouveau device"];
        break;
      case "card_testing":
        merchantCat = "online";
        merchantName = pick(MERCHANTS_BY_CAT.online);
        amount = round2(1 + rng()*3);
        city = account.city;
        device = "device-unknown-" + Math.floor(rng()*9999);
        riskFactors = ["Micro-transaction","Nouveau device","Pattern séquentiel"];
        break;
      case "account_takeover":
        merchantCat = "transfers";
        merchantName = "Interac";
        amount = Math.round(account.balance * (0.4 + rng()*0.5));
        city = pick(CITIES.filter(c=>c!==account.city));
        device = "device-new-" + Math.floor(rng()*9999);
        riskFactors = ["Nouveau IP + device","MDP changé <24h","Montant = 60% solde","Bénéficiaire inconnu"];
        break;
      case "mule_network":
        merchantCat = "transfers";
        merchantName = "Payee-TEMP-" + Math.floor(rng()*99);
        amount = Math.round(180 + rng()*640);
        city = account.city;
        device = account.id + "-primary";
        riskFactors = ["Bénéficiaire lié à cluster suspect","Entrant → sortant <2min","Comptes relais détectés"];
        break;
      case "structuring":
        merchantCat = "transfers";
        merchantName = "Interac";
        amount = Math.round(9000 + rng()*950);
        city = account.city;
        device = account.id + "-primary";
        riskFactors = ["Sous seuil déclaration","Fractionnement détecté","5e virement en 20 min"];
        break;
      case "wire_fraud":
        merchantCat = "transfers";
        merchantName = "Wise";
        amount = Math.round(2800 + rng()*12000);
        city = account.city;
        device = account.id + "-primary";
        riskFactors = ["IBAN bénéficiaire modifié","Correspondant à risque","Email spoofé détecté"];
        break;
      case "mobile_pay":
        merchantCat = "online";
        merchantName = pick(["Apple Pay","Google Pay"]);
        amount = Math.round(420 + rng()*1400);
        city = pick(CITIES.filter(c=>c!==account.city));
        device = "wallet-new-" + Math.floor(rng()*9999);
        riskFactors = ["Wallet activé <1h","Appel entrant lié","Géoloc inhabituelle"];
        break;
    }
  } else {
    // Legitimate
    const cat = pick(profile.prefCat);
    merchantCat = cat;
    // 80% habitual merchant, 20% new
    if (rng() < 0.8 && account.habitualMerchants.length) {
      merchantName = pick(account.habitualMerchants).name;
    } else {
      merchantName = pick(MERCHANTS_BY_CAT[cat]);
    }
    amount = Math.max(1, round2(account.avgTxn * (0.3 + rng()*1.8) + gauss(0, account.avgTxn*0.2)));
    city = rng() < 0.92 ? account.city : pick(profile.cities);
    device = account.id + "-primary";
  }

  txnCounter++;
  return {
    id: "TX-" + String(80000 + txnCounter).padStart(6,"0"),
    accountId: account.id,
    account: account.name,
    merchant: merchantName,
    category: merchantCat,
    amount,
    city,
    device,
    timestamp: now,
    hour,
    isFraud,
    fraudType,
    riskFactors
  };
}

// --- score a transaction (heuristic stand-in for the real ML model) ---
function scoreTransaction(txn, account) {
  let score = 0;
  const profile = PROFILE_TYPES.find(p => p.key === account.profile);

  // amount anomaly
  const amountRatio = txn.amount / Math.max(1, account.avgTxn);
  if (amountRatio > 4) score += 22;
  else if (amountRatio > 2) score += 10;

  // merchant category
  if (txn.category === "suspicious") score += 28;
  if (txn.category === "transfers" && amountRatio > 3) score += 18;

  // location mismatch
  if (txn.city !== account.city) score += 14;
  if (!profile.cities.includes(txn.city)) score += 12;

  // device
  if (txn.device.includes("unknown") || txn.device.includes("new") || txn.device.includes("wallet-new")) score += 18;

  // hour
  if (txn.hour < profile.hours[0] || txn.hour > profile.hours[1]) score += 9;

  // fraud-specific boosts (model signal)
  if (txn.isFraud) {
    // model catches most but not all
    const caughtRates = {
      stolen_card: 0.92, card_testing: 0.78, account_takeover: 0.88,
      mule_network: 0.71, structuring: 0.74, wire_fraud: 0.62, mobile_pay: 0.80
    };
    if (rng() < caughtRates[txn.fraudType]) score += 40;
  } else {
    // false positives
    if (rng() < 0.04) score += 30;
  }

  score += Math.round(gauss(0, 4));
  return clamp(Math.round(score), 0, 100);
}

function decideAction(score) {
  if (score >= 70) return "blocked";
  if (score >= 45) return "review";
  return "approved";
}

// --- historical metrics for model stats view ---
function generateHistoricalMetrics() {
  // 30 days of metrics
  const days = [];
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now); d.setDate(d.getDate() - i);
    days.push({
      date: d.toISOString().slice(0,10),
      label: d.toLocaleDateString("fr-CA",{month:"short",day:"numeric"}),
      detected: Math.floor(180 + rng()*80 + (29-i)*2),
      missed: Math.floor(18 + rng()*10),
      falsePositives: Math.floor(22 + rng()*18 - (29-i)*0.3),
      saved: Math.floor(82000 + rng()*45000 + (29-i)*1200)
    });
  }
  // confusion matrix (totals across last 30d)
  let TP=0, FP=0, FN=0, TN=0;
  for (const d of days) { TP += d.detected; FN += d.missed; FP += d.falsePositives; }
  TN = 312450; // lots of legitimate
  const perScenario = FRAUD_SCENARIOS.map(s => ({
    ...s,
    recall: 0.58 + rng()*0.38,
    precision: 0.65 + rng()*0.30,
    volume: Math.floor(40 + rng()*220),
    avgAmount: Math.floor(180 + rng()*2400)
  }));
  // ROC-ish points
  const roc = [];
  for (let t = 0; t <= 20; t++) {
    const x = t/20;
    roc.push({ fpr: x, tpr: Math.min(1, 1 - Math.pow(1-x, 0.35)) });
  }
  return { days, confusion: {TP,FP,FN,TN}, perScenario, roc };
}

window.FraudNet = {
  PROFILE_TYPES, FRAUD_SCENARIOS, MERCHANTS_BY_CAT, CITIES,
  generateAccounts, generateTransaction, scoreTransaction, decideAction,
  generateHistoricalMetrics, rng
};
