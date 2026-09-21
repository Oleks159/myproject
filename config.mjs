// All values here are explicit DEMO configuration, not a selected production economy.
export const config = Object.freeze({
  version: 'v1-connected-2026-09-20', productionApproved: false,
  botHandle: 'No_RakePokerbot', startingChips: 5000,
  faucetThreshold: 1000, faucetTarget: 1000, faucetInterval: 6 * 3600000,
  dailyRewardInterval: 24 * 3600000, dailyRewardRateBonusCap: 50,
  activationHands: 50, cycleDuration: 6 * 3600000,
  minParticipants: 3, minQualifiedStreet: 3, decisionMs: 15000,
  botProgressionMultiplier: 1,
  rateScale: 1000000, rateCurveMultiplier: 4, rateCurveDivisor: 10000,
  referralRatesBps: Object.freeze({ Bronze: 200, Silver: 300, Gold: 400, Platinum: 500, Diamond: 600, Master: 700 }),
  leagueThresholds: Object.freeze({ Bronze: 0, Silver: 500, Gold: 1200, Platinum: 2200, Diamond: 3500, Master: 5000 }),
  leagueStakeUnlocks: Object.freeze({ Bronze: 2, Silver: 3, Gold: 4, Platinum: 5, Diamond: 6, Master: 7 }),
  dailyRewardBase: Object.freeze({ Bronze: 300, Silver: 750, Gold: 1500, Platinum: 3000, Diamond: 7500, Master: 15000 }),
  stakes: [
    { id: 'micro', name: 'Micro', small: 5, big: 10, buyIn: 1000, league: 'Bronze' },
    { id: 'low', name: 'Low', small: 10, big: 20, buyIn: 2000, league: 'Bronze' },
    { id: 'mid', name: 'Mid', small: 25, big: 50, buyIn: 5000, league: 'Silver' },
    { id: 'high', name: 'High', small: 50, big: 100, buyIn: 10000, league: 'Gold' },
    { id: 'elite', name: 'Elite', small: 100, big: 200, buyIn: 20000, league: 'Platinum' },
    { id: 'premier', name: 'Premier', small: 250, big: 500, buyIn: 50000, league: 'Diamond' },
    { id: 'legend', name: 'Legend', small: 500, big: 1000, buyIn: 100000, league: 'Master' }
  ],
  missions: [
    { id: 'hands15', title: 'Am Tisch zu Hause', description: '15 qualifizierende Hände spielen', metric: 'qualifiedHands', target: 15, reward: 2000 },
    { id: 'wins3', title: 'Drei gute Hände', description: '3 Hände gewinnen', metric: 'wins', target: 3, reward: 1500 },
    { id: 'cycle1', title: 'Der erste Zyklus', description: 'Einen Earning-Zyklus starten', metric: 'cycles', target: 1, reward: 1000 }
  ]
});
