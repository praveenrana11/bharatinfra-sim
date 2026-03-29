const fs = require('fs');

const path = 'app/sessions/[sessionId]/round/[roundNumber]/page.tsx';
let lines = fs.readFileSync(path, 'utf8').split(/\r?\n/);

const stateIdx = lines.findIndex(l => l.includes('const [eventsChosen, setEventsChosen] = useState<Record<string, string>>({});'));
if (stateIdx !== -1 && !lines.some(l => l.includes('const [forecast, setForecast]'))) {
  const insert = [
    '  const [forecast, setForecast] = useState({',
    '    predicted_schedule_index: 1.0,',
    '    predicted_cost_index: 1.0,',
    '    confidence: 50',
    '  });'
  ];
  lines.splice(stateIdx + 1, 0, ...insert);
}

const hydrateIdx = lines.findIndex(l => l.includes('setEventsChosen(initChosen);'));
if (hydrateIdx !== -1 && !lines.some(l => l.includes('if (warRoomV2?.forecast) {'))) {
  const insert = [
    '        if (warRoomV2?.forecast) {',
    '          setForecast(warRoomV2.forecast);',
    '        }'
  ];
  lines.splice(hydrateIdx + 2, 0, ...insert); // Skip the '}' of the if statement
}

// Update payload
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('eventsChosen: Object.entries(eventsChosen).map(([eventId, choiceId]) => ({ eventId, choiceId }))') && !lines[i].includes('forecast: forecast')) {
    lines[i] = lines[i].replace('))', ')),\n              forecast: forecast');
  }
}

// Update UI
const previewIdx = lines.findIndex(l => l.includes('>Deterministic Preview<'));
if (previewIdx !== -1 && !lines.some(l => l.includes('>Pre-Lock Forecast<'))) {
  let insertIdx = previewIdx;
  while(insertIdx < lines.length && !lines[insertIdx].includes('</div>')) {
    insertIdx++;
  }
  // The structure is:
  // <div className="p-5 rounded-2xl bg-amber-50...
  //    ...
  //    <div className="grid...
  //      ...
  //    </div>
  // </div> // <- we need to insert right after this closing div
  
  // Actually simpler: search for:
  //                              <div className="flex flex-col"><span className="text-[10px] uppercase text-amber-500/70">Points Expected</span><span className="text-xl font-mono font-bold text-amber-400">+{Math.round(previewResult.points_earned)}</span></div>
  //                            </div>
  //                         </div>
  const targetLineIdx = lines.findIndex(l => l.includes('+{Math.round(previewResult.points_earned)}'));
  if (targetLineIdx !== -1) {
    const insertUI = [
    '                        <div className="p-5 rounded-2xl bg-slate-900/40 border border-purple-500/30 space-y-4 mt-6">',
    '                          <div className="text-[10px] font-bold uppercase tracking-widest text-purple-400">Pre-Lock Forecast</div>',
    '                          <p className="text-xs text-slate-400">Before locking, predict your performance. Future rounds will tie point bonuses to prediction calibration.</p>',
    '                          <div className="space-y-6 pt-2">',
    '                             <DecisionSlider',
    '                               label="Predicted SPI"',
    '                               value={forecast.predicted_schedule_index}',
    '                               min={0.60}',
    '                               max={1.35}',
    '                               step={0.01}',
    '                               onChange={(v) => { setHasUnsavedChanges(true); setForecast(p => ({...p, predicted_schedule_index: v})); }}',
    '                               disabled={isLocked}',
    '                               formatValue={(v) => v.toFixed(2)}',
    '                               hint="> 1.0 means ahead of schedule"',
    '                             />',
    '                             <DecisionSlider',
    '                               label="Predicted CPI"',
    '                               value={forecast.predicted_cost_index}',
    '                               min={0.60}',
    '                               max={1.50}',
    '                               step={0.01}',
    '                               onChange={(v) => { setHasUnsavedChanges(true); setForecast(p => ({...p, predicted_cost_index: v})); }}',
    '                               disabled={isLocked}',
    '                               formatValue={(v) => v.toFixed(2)}',
    '                               hint="> 1.0 means under budget"',
    '                             />',
    '                             <DecisionSlider',
    '                               label="Confidence Level"',
    '                               value={forecast.confidence}',
    '                               min={0}',
    '                               max={100}',
    '                               step={5}',
    '                               onChange={(v) => { setHasUnsavedChanges(true); setForecast(p => ({...p, confidence: v})); }}',
    '                               disabled={isLocked}',
    '                               formatValue={(v) => v + "%"}',
    '                               hint="Over-confidence will be heavily penalized later."',
    '                             />',
    '                          </div>',
    '                        </div>'
    ];
    lines.splice(targetLineIdx + 3, 0, ...insertUI);
  }
}

fs.writeFileSync(path, lines.join('\\n'));
console.log("Patched Forecast Decisions.");
