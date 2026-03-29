const fs = require('fs');

const path = 'app/sessions/[sessionId]/round/[roundNumber]/results/page.tsx';
let lines = fs.readFileSync(path, 'utf8').split(/\r?\n/);

const importIdx = lines.findIndex(l => l.includes('import { getRoundEvents, GameEvent }'));
if (importIdx !== -1 && !lines.some(l => l.includes('buildAfterActionReview'))) {
  lines.splice(importIdx + 1, 0, 'import { buildAfterActionReview, AfterActionReview } from "@/lib/reflectionEngine";');
}

const stateIdx = lines.findIndex(l => l.includes('const [decisionRaw, setDecisionRaw]'));
if (stateIdx !== -1 && !lines.some(l => l.includes('const [aar, setAar]'))) {
  lines.splice(stateIdx + 1, 0, '  const [aar, setAar] = useState<AfterActionReview | null>(null);');
}

const resultIdx = lines.findIndex(l => l.includes('setResult(activeResult);'));
if (resultIdx !== -1 && !lines.some(l => l.includes('setAar(computedAar)'))) {
  const insertState = [
    '      if (decision && activeResult) {',
    '        const computedAar = buildAfterActionReview({',
    '          actual: { schedule_index: activeResult.schedule_index, cost_index: activeResult.cost_index, points_earned: activeResult.points_earned, quality_score: activeResult.quality_score, safety_score: activeResult.safety_score, stakeholder_score: activeResult.stakeholder_score },',
    '          forecast: (decision.raw?.war_room_v2 as any)?.forecast ?? null,',
    '          eventsChosen: (decision.raw?.war_room_v2 as any)?.eventsChosen ?? null,',
    '          decisions: { buffer_percent: decision.buffer_percent, risk_appetite: decision.risk_appetite, governance_intensity: decision.governance_intensity, focus_speed: decision.focus_speed, focus_cost: decision.focus_cost, focus_quality: decision.focus_quality, focus_stakeholder: decision.focus_stakeholder }',
    '        });',
    '        setAar(computedAar);',
    '      }'
  ];
  lines.splice(resultIdx + 1, 0, ...insertState);
}

const uiTargetIdx = lines.findIndex(l => l.includes('Calibration note: Your ability to accurately forecast'));
if (uiTargetIdx !== -1 && !lines.some(l => l.includes('After Action Review'))) {
  // Find </p>\n              </div>\n            )}
  let matchIdx = uiTargetIdx;
  while(matchIdx < lines.length && !lines[matchIdx].includes(')}')) {
    matchIdx++;
  }
  const aarUI = [
    '            {aar && (',
    '              <div className="rounded-md border border-indigo-500/30 bg-slate-900 p-5 space-y-4 text-slate-200 mt-6">',
    '                <div className="flex items-center justify-between border-b mx-[-20px] px-5 pb-4 border-slate-800">',
    '                  <h2 className="text-sm font-bold uppercase tracking-widest text-indigo-400">After Action Review</h2>',
    '                  <span className="text-[10px] uppercase tracking-widest bg-indigo-500/10 text-indigo-400 px-3 py-1.5 rounded-full font-bold">CALIBRATION GRADE: {aar.calibration.calibration_grade}</span>',
    '                </div>',
    '                <div className="text-base font-medium text-slate-100 italic px-2">" {aar.headline} "</div>',
    '                <div className="space-y-4 pt-2">',
    '                  {aar.causes.map((cause, idx) => (',
    '                    <div key={idx} className="bg-slate-950 p-4 rounded-xl border border-slate-800 flex flex-col md:flex-row gap-4">',
    '                       <div className="flex-1 space-y-2">',
    '                          <div className="flex items-center gap-2">',
    '                             <span className="text-indigo-400 font-bold">{cause.title}</span>',
    '                             <span className="text-[9px] uppercase tracking-widest bg-slate-800 px-2 py-0.5 rounded text-slate-400">{cause.concept_tag}</span>',
    '                          </div>',
    '                          <div className="text-sm text-slate-300 leading-relaxed">{cause.because}</div>',
    '                       </div>',
    '                       <div className="md:w-[35%] shrink-0 border-t md:border-t-0 md:border-l border-slate-800 pt-3 md:pt-0 md:pl-4 flex flex-col justify-center">',
    '                          <div className="text-[10px] uppercase font-bold text-slate-500 tracking-widest mb-1">Recommended Action</div>',
    '                          <div className="text-xs text-slate-400 font-medium leading-relaxed">{cause.recommended_action}</div>',
    '                       </div>',
    '                    </div>',
    '                  ))}',
    '                </div>',
    '                <div className="pt-3 pb-1 border-t border-slate-800 mx-[-20px] px-5 flex justify-end">',
    '                  <button className="text-[10px] font-bold uppercase tracking-widest px-6 py-2 bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 border border-indigo-500/20 rounded transition-colors" onClick={() => alert("Takes you to a quick 2-minute drill related to this report. (Pending module)")}>Take 2-Minute Drill</button>',
    '                </div>',
    '              </div>',
    '            )}',
    ''
  ];
  lines.splice(matchIdx + 1, 0, ...aarUI);
}

fs.writeFileSync(path, lines.join('\\n'));
console.log("Patched AAR into Results.");
