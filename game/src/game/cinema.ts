import { rng } from '../core/util';

// All films are fictional. Seat counts and lease prices are game values, not real theatre data.
export interface Film { id: string; title: string; te: string; genre: string; star: number; quality: number; tagline: string; colors: [string, string] }
export const FILMS: Omit<Film, 'quality'>[] = [
  { id: 'f1', title: 'Biryani Bhai', te: 'బిర్యానీ భాయ్', genre: 'Comedy', star: 3, tagline: 'One pot. Two families. Zero patience.', colors: ['#E65100', '#FFE0B2'] },
  { id: 'f2', title: 'Deccan Thunder', te: 'దక్కన్ థండర్', genre: 'Mass action', star: 5, tagline: 'When he walks in, the whistles start.', colors: ['#B71C1C', '#FFD54F'] },
  { id: 'f3', title: 'Nakko Late', te: 'నక్కో లేట్', genre: 'Rom-com', star: 2, tagline: 'Love arrives in 30 minutes or less.', colors: ['#AD1457', '#FCE4EC'] },
  { id: 'f4', title: 'Metro Ghost', te: 'మెట్రో ఘోస్ట్', genre: 'Horror', star: 2, tagline: 'The last train never reaches Nagole.', colors: ['#1A237E', '#B3E5FC'] },
  { id: 'f5', title: 'Tank Bund Love Story', te: 'ట్యాంక్ బండ్ లవ్ స్టోరీ', genre: 'Romance', star: 3, tagline: 'Every sunset has a second show.', colors: ['#F57C00', '#FFF3E0'] },
  { id: 'f6', title: 'Bonalu Beat', te: 'బోనాలు బీట్', genre: 'Family musical', star: 3, tagline: 'The whole galli is dancing.', colors: ['#6A1B9A', '#FFEB3B'] },
  { id: 'f7', title: 'Cyber Tower Siege', te: 'సైబర్ టవర్ సీజ్', genre: 'Action thriller', star: 4, tagline: 'Forty floors. One way out.', colors: ['#004D40', '#80CBC4'] },
  { id: 'f8', title: 'Golconda Heist', te: 'గోల్కొండ హైస్ట్', genre: 'Heist', star: 4, tagline: 'The diamond was never in the fort.', colors: ['#3E2723', '#FFCA28'] },
  { id: 'f9', title: 'Mission Hussain Sagar', te: 'మిషన్ హుస్సేన్ సాగర్', genre: 'Thriller', star: 3, tagline: '48 hours. One lake. No witnesses.', colors: ['#01579B', '#E1F5FE'] },
  { id: 'f10', title: 'Amma Chethi Vanta', te: 'అమ్మ చేతి వంట', genre: 'Family drama', star: 2, tagline: 'Some recipes can\'t be delivered.', colors: ['#558B2F', '#F1F8E9'] },
  { id: 'f11', title: 'Kodi Kura Kingdom', te: 'కోడి కూర కింగ్‌డమ్', genre: 'Comedy', star: 2, tagline: 'A royal feud over the last leg piece.', colors: ['#D84315', '#FFF8E1'] },
  { id: 'f12', title: 'Second Show Shankar', te: 'సెకండ్ షో శంకర్', genre: 'Mass action', star: 4, tagline: 'The night belongs to the projectionist.', colors: ['#212121', '#FF5252'] },
  { id: 'f13', title: 'Pani Puri Prince', te: 'పానీ పూరి ప్రిన్స్', genre: 'Rom-com', star: 3, tagline: 'Spicy, tangy, and totally in love.', colors: ['#2E7D32', '#FFF59D'] },
  { id: 'f14', title: 'Chai Biscuit Champion', te: 'చాయ్ బిస్కెట్ ఛాంపియన్', genre: 'Sports drama', star: 3, tagline: 'From the Irani café to the stadium.', colors: ['#5D4037', '#FFE082'] },
];
const GENRE_FIT: Record<string, number> = { 'Mass action': 1.25, 'Comedy': 1.05, 'Family musical': 1.0, 'Family drama': 0.9, 'Romance': 0.95, 'Rom-com': 1.0, 'Horror': 0.85, 'Action thriller': 1.1, 'Heist': 1.0, 'Thriller': 0.95, 'Sports drama': 0.95 };
const DAY_F = [1.35, 1.4, 1.45, 0.75, 0.7, 0.7, 0.8];        // release day (Friday) .. Thursday
export const PRICES = [100, 150, 200, 250];
export const CAMPAIGNS = [{ id: 'none', label: 'No campaign', cost: 0, hype: 0 }, { id: 'posters', label: 'Wall posters', cost: 250, hype: 0.15 }, { id: 'radio', label: 'Radio jingles', cost: 700, hype: 0.3 }, { id: 'both', label: 'Posters + radio', cost: 900, hype: 0.42 }];
const RUPEES_PER_COIN = 200, DAILY_COST = 6000, THEATRE_SHARE = 0.45;

// `at` anchors each screen to its real location (lat, lon); several cinemas share names across the city
export interface TheatreDef { key: string; name: string; match: RegExp; lease: number; seats: number; at: [number, number]; area: string }
const RTC: [number, number] = [17.4068, 78.4965];
export const LADDER: TheatreDef[] = [
  { key: 'sandhya35', name: 'Sandhya 35mm', match: /sandhya cinema|sandhya 35/i, lease: 3000, seats: 620, at: RTC, area: 'RTC X Roads' },
  { key: 'sudarshan', name: 'Sudarshan 35mm', match: /sudarshan|sudharshan/i, lease: 4500, seats: 700, at: RTC, area: 'RTC X Roads' },
  { key: 'devi', name: 'Devi 70MM', match: /devi 70/i, lease: 6500, seats: 900, at: RTC, area: 'RTC X Roads' },
  { key: 'saptagiri', name: 'Saptagiri 70MM', match: /saptagiri|sapthagiri/i, lease: 8000, seats: 950, at: RTC, area: 'RTC X Roads' },
  { key: 'mayuri', name: 'Sri Mayuri 70MM', match: /mayuri 70/i, lease: 10000, seats: 1000, at: RTC, area: 'RTC X Roads' },
  { key: 'shanti', name: 'Shanti 70mm', match: /shanti 70/i, lease: 12000, seats: 1050, at: [17.3961, 78.4901], area: 'Narayanguda' },
  { key: 'tarakarama', name: 'Tarakarama', match: /tarakarama/i, lease: 15000, seats: 1100, at: [17.3907, 78.4879], area: 'Kacheguda' },
  { key: 'ramakrishna', name: 'Ramakrishna 70MM', match: /ramakrishna 70|ramakrishna 35|ramkrishna/i, lease: 18000, seats: 1200, at: [17.3859, 78.4772], area: 'Abids' },
  { key: 'sandhya70', name: 'Sandhya 70MM', match: /sandhya 70/i, lease: 20000, seats: 1300, at: RTC, area: 'RTC X Roads' },
  { key: 'tivoli', name: 'Tivoli', match: /tivoli/i, lease: 22000, seats: 1150, at: [17.4484, 78.4928], area: 'Secunderabad' },
  { key: 'sreeramulu', name: 'Sree Ramulu', match: /sree ramulu/i, lease: 24000, seats: 1200, at: [17.4677, 78.4292], area: 'Moosapet' },
  { key: 'galaxy', name: 'Galaxy', match: /galaxy/i, lease: 26000, seats: 1250, at: [17.4034, 78.411], area: 'Tolichowki' },
  { key: 'rajadhani', name: 'Rajadhani 70MM', match: /rajadhani/i, lease: 28000, seats: 1300, at: [17.3689, 78.5272], area: 'Dilsukhnagar' },
  { key: 'sriramana', name: 'Sri Ramana', match: /sri ramana/i, lease: 30000, seats: 1250, at: [17.3924, 78.5157], area: 'Amberpet' },
  { key: 'shama', name: 'Shama', match: /shama theatre/i, lease: 32000, seats: 1200, at: [17.3415, 78.4656], area: 'Old City' },
  { key: 'gokul', name: 'Gokul', match: /gokul theatre/i, lease: 34000, seats: 1250, at: [17.4536, 78.4345], area: 'Erragadda' },
  { key: 'vimal', name: 'Vimal 70mm', match: /vimal 70/i, lease: 36000, seats: 1300, at: [17.4637, 78.4514], area: 'Balanagar' },
  { key: 'viswanath', name: 'Viswanath 70MM', match: /viswanath 70/i, lease: 40000, seats: 1400, at: [17.4968, 78.3965], area: 'Kukatpally' },
  { key: 'bhramaramba', name: 'Bhramaramba 70mm', match: /bramarambha|bhramaramba|brahmarambha/i, lease: 44000, seats: 1450, at: [17.4999, 78.3868], area: 'Kukatpally' },
  { key: 'indranagendra', name: 'Indra Nagendra 70MM', match: /indra nagendra 70/i, lease: 48000, seats: 1450, at: [17.3519, 78.5354], area: 'Karmanghat' },
  { key: 'talluri', name: 'Talluri', match: /talluri/i, lease: 52000, seats: 1500, at: [17.4776, 78.5724], area: 'Kushaiguda' },
  { key: 'sangeetha', name: 'Sangeetha 70mm', match: /sangeetha ac 70|sangeetha theatre/i, lease: 60000, seats: 1600, at: [17.5128, 78.2889], area: 'RC Puram' },
];

export interface Lease { theatre: string; film: Film; price: number; shows: number; campaign: string; startDay: number; days: DayReport[]; hype: number; wom: number; done: boolean }
export interface DayReport { day: number; tickets: number; occupancy: number; gross: number; coins: number; note: string }

export function makeSlate(seed: number): Film[] {
  const r = rng(seed);
  const pool = FILMS.slice().sort(() => r() - 0.5).slice(0, 6);
  return pool.map((f) => ({ ...f, quality: Math.min(1, Math.max(0.1, r.range(0.15, 0.95) + (f.star - 3) * 0.04)) }));
}

export function projection(t: TheatreDef, f: Film, price: number, shows: number) {
  // rough opening-day projection shown before signing (no hidden quality)
  const base = (0.35 + 0.12 * f.star) * (GENRE_FIT[f.genre] || 1) * DAY_F[0] * Math.pow(150 / price, 1.1);
  return Math.min(1, base);
}

export function simulateDay(l: Lease, t: TheatreDef, dayIndex: number, r: () => number): DayReport {
  const f = l.film;
  if (dayIndex === 0) l.wom = 1;
  const rain = r() < 0.15;
  const rival = r() < 0.12 && dayIndex > 1;
  let occ = (0.35 + 0.12 * f.star) * (GENRE_FIT[f.genre] || 1) * l.hype * l.wom * DAY_F[dayIndex] * Math.pow(150 / l.price, 1.1) * (rain ? 0.75 : 1) * (rival ? 0.82 : 1);
  occ = Math.max(0.04, Math.min(1, occ * (0.92 + r() * 0.16)));
  const tickets = Math.round(t.seats * l.shows * occ);
  const gross = tickets * l.price;
  const net = gross * THEATRE_SHARE - DAILY_COST;
  const coins = Math.round(net / RUPEES_PER_COIN);
  let note = occ > 0.95 ? 'HOUSEFULL boards outside! ' : occ > 0.7 ? 'Strong crowds. ' : occ > 0.4 ? 'Decent footfall. ' : 'Empty rows. ';
  if (dayIndex === 0) {
    const rating = 1.5 + f.quality * 3.3;
    note += `Reviews: ${rating.toFixed(1)}/5 — ${f.quality > 0.7 ? '"Blockbuster vibes"' : f.quality > 0.45 ? '"One-time watch"' : '"Test of patience"'}. `;
    l.wom = 0.55 + f.quality * 0.95;
  } else l.wom *= 0.9 + (f.quality - 0.5) * 0.22;
  if (rain) note += 'Rain kept people home. ';
  if (rival) note += 'A rival release split the crowd. ';
  l.hype *= 0.88;
  const rep = { day: dayIndex + 1, tickets, occupancy: occ, gross, coins, note: note.trim() };
  l.days.push(rep);
  return rep;
}
export const CINEMA_CONST = { RUPEES_PER_COIN, DAILY_COST, THEATRE_SHARE };
