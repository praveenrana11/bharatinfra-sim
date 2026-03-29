const fs = require('fs');

const path = 'app/sessions/[sessionId]/round/[roundNumber]/results/page.tsx';
let lines = fs.readFileSync(path, 'utf8').split(/\r?\n/);

const importIdx = lines.findIndex(l => l.includes('import { ConstructionEvent }'));
if (importIdx !== -1 && !lines.some(l => l.includes('getRoundEvents'))) {
  lines.splice(importIdx + 1, 0, 'import { getRoundEvents, GameEvent } from "@/lib/eventDeck";');
}

const yearlyResultsIdx = lines.findIndex(l => l.includes('const [yearlyResults, setYearlyResults]'));
if (yearlyResultsIdx !== -1 && !lines.some(l => l.includes('setDecisionRaw'))) {
  lines.splice(yearlyResultsIdx + 1, 0, '  const [decisionRaw, setDecisionRaw] = useState<Record<string, unknown> | null>(null);');
}

const decisionCastIdx = lines.findIndex(l => l.includes('const decision = decisionData as DecisionRow | null;'));
if (decisionCastIdx !== -1 && !lines.some(l => l.includes('setDecisionRaw(decision.raw'))) {
  lines.splice(decisionCastIdx + 1, 0, '      if (decision) { setDecisionRaw(decision.raw as Record<string, unknown> | null); }');
}

const shocksIdx = lines.findIndex(l => l.includes('>Round Shocks Applied<'));
if (shocksIdx !== -1 && !lines.some(l => l.includes('Round Recap: Your Event Choices'))) {
  // Find the parent div
  let insertIdx = shocksIdx;
  while(insertIdx > 0 && !lines[insertIdx].includes('className="rounded-md')) {
    insertIdx--;
  }

  const recapUI = [
    '            {decisionRaw?.war_room_v2 && Array.isArray((decisionRaw.war_room_v2 as any).eventsChosen) && ((decisionRaw.war_room_v2 as any).eventsChosen.length > 0) && (',
    '              <div className="rounded-md border border-teal-500/30 bg-slate-900 p-5 space-y-4 text-slate-200">',
    '                <h2 className="text-sm font-bold uppercase tracking-widest text-teal-400">Round Recap: Your Event Choices</h2>',
    '                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">',
    '                  {(() => {',
    '                    const deck = getRoundEvents(sessionId, teamId, roundNumber);',
    '                    const chosen = (decisionRaw.war_room_v2 as any).eventsChosen;',
    '                    return chosen.map((c: any) => {',
    '                      const evt = deck.find((e: any) => e.id === c.eventId);',
    '                      const choice = evt?.choices.find((ch: any) => ch.id === c.choiceId);',
    '                      if (!evt || !choice) return null;',
    '                      return (',
    '                        <div key={c.eventId} className="rounded-lg border border-slate-800 bg-slate-950 p-4 text-sm flex flex-col justify-between h-full">',
    '                          <div>',
    '                            <div className="font-semibold text-slate-300">{evt.title}</div>',
    '                            <div className="mt-2 text-teal-400 font-medium flex items-start gap-2">',
    '                              <span className="mt-0.5">↳</span>',
    '                              <span>{choice.label}</span>',
    '                            </div>',
    '                          </div>',
    '                          <div className="mt-4 text-xs text-slate-500 italic border-t border-slate-800 pt-3 relative bottom-0">',
    '                            {choice.theoryHint}',
    '                          </div>',
    '                        </div>',
    '                      );',
    '                    });',
    '                  })()}',
    '                </div>',
    '              </div>',
    '            )}',
    ''
  ];
  lines.splice(insertIdx, 0, ...recapUI);
}

fs.writeFileSync(path, lines.join('\n'));
console.log("Patched Results.");
