import { loadLevels } from '../../src/delivery/content/levels';
import { auditCampaignCharacters } from '../../src/delivery/art/campaign-release';
import { campaignScenario, campaignScenarioURL } from '../../src/delivery/qa/campaign-scenarios';

const levels = loadLevels(), art = auditCampaignCharacters(levels);
for (const touch of [false, true]) {
  const query = new URLSearchParams({ qaDelivery: '1', qaScene: '1', qaCampaign: '1', qaCampaignMode: 'full', q: 'low' });
  if (touch) query.set('qaTouch', '1');
  (document.getElementById(touch ? 'full-touch' : 'full-desktop') as HTMLAnchorElement).href = '/?' + query;
}
const container = document.getElementById('scenes')!;
for (const level of levels) {
  const scenario = campaignScenario(level.id); if (!scenario) continue;
  const section = document.createElement('section'); section.className = 'scene';
  const heading = document.createElement('h2'); heading.textContent = `${level.level} / ${levels.length} · ${scenario.title}`;
  const destination = document.createElement('small'); destination.textContent = level.destination.label;
  const steps = document.createElement('ol'); for (const text of scenario.manualSteps) { const li = document.createElement('li'); li.textContent = text; steps.append(li); }
  const negative = document.createElement('p'); negative.className = 'negative'; negative.textContent = 'Retry check: ' + scenario.negativeTrial;
  const checks = document.createElement('details'), title = document.createElement('summary'); title.textContent = 'Visual checks and required evidence'; checks.append(title);
  for (const text of scenario.visualChecks) { const p = document.createElement('p'); p.textContent = text; checks.append(p); }
  const facts = document.createElement('small'); facts.textContent = 'Observed facts: ' + scenario.requiredFacts.join(', '); checks.append(facts);
  const release = document.createElement('p'); release.className = 'art';
  release.textContent = scenario.artIds.length ? 'Independent appearance gate: ' + scenario.artIds.map(id => `${id}: ${art.find(row => row.characterId === id)?.status ?? 'pending'}`).join(' · ') : 'No named character required for this scene.';
  const links = document.createElement('div'); links.className = 'launch';
  for (const touch of [false, true]) { const link = document.createElement('a'); link.href = campaignScenarioURL(level, touch); link.target = '_blank'; link.rel = 'noopener'; link.textContent = touch ? 'Isolated · touch layout' : 'Isolated · desktop'; links.append(link); }
  section.append(heading, destination, steps, negative, checks, release, links); container.append(section);
}
document.getElementById('report')!.addEventListener('change', async event => {
  const file = (event.target as HTMLInputElement).files?.[0], output = document.getElementById('review')!; if (!file) return;
  try {
    const report = JSON.parse(await file.text());
    if (![1,2].includes(report.schemaVersion) || !Array.isArray(report.rows) || !Array.isArray(report.expectedLevelIds)) throw new Error('Not a campaign QA export');
    const pre = document.createElement('pre');
    const correctContent = report.expectedLevelIds.join('|') === levels.map(level => level.id).join('|');
    pre.textContent = `${correctContent ? 'Content IDs match this build.' : 'WARNING: content IDs differ from this build.'}\nMode: ${report.metadata?.mode}\nInput: ${report.inputEvidence?.trustedTouchObserved ? 'trusted touch observed' : 'no trusted touch observed'}; physical hardware unverified\nAssistance: ${report.assistance?.length ?? '?'}\n\n` + report.rows.map(row => `${row.level}: ${row.completed ? 'completed' : 'incomplete'} · pickup ${row.naturalJumpPickup ? 'jump-grab' : 'not observed'}\n  Missing scene facts: ${row.missingFacts?.join(', ') || 'none'}\n  Missing independent art: ${row.missingArt?.join(', ') || 'none'}\n  Missing visual checks: ${row.missingVisualChecks?.length ?? 'legacy export: unrecorded'}`).join('\n') + '\n\nVisual side-by-side review and physical hardware evidence remain separate from event records.';
    output.replaceChildren(pre);
  } catch (error) { output.textContent = 'Cannot review this file: ' + String(error); }
});
