const fs = require('fs');

const path = 'app/sessions/[sessionId]/round/[roundNumber]/results/page.tsx';
let lines = fs.readFileSync(path, 'utf8').split(/\r?\n/);

const recapIdx = lines.findIndex(l => l.includes('Round Recap: Your Event Choices'));

if (recapIdx !== -1 && !lines.some(l => l.includes('Prediction vs Actual Calibration'))) {
  // Find the end of this block
  let insertIdx = recapIdx;
  let divCount = 0;
  let started = false;
  
  // We need to trace the div nesting of the element wrapping the recap.
  // The recap starts with `<div className="rounded-md border border-teal-500` one line above recapIdx.
  insertIdx--; // Now points to the div
  
  for (let i = insertIdx; i < lines.length; i++) {
    if (lines[i].includes('<div')) {
      // rough count, but since it's just regex we might miss some.
      // let's just use string matching
      const opens = (lines[i].match(/<div/g) || []).length;
      const closes = (lines[i].match(/<\/div>/g) || []).length;
      divCount += opens - closes;
      started = true;
    } else if (lines[i].includes('</div')) {
      const closes = (lines[i].match(/<\/div>/g) || []).length;
      divCount -= closes;
    }
    
    if (started && divCount === 0) {
      insertIdx = i + 1; // inserted just after this div closes
      // Wait, there is a `)}` after the div closes
      if (lines[i+1].includes(')}')) {
        insertIdx = i + 2;
      }
      break;
    }
  }

  const forecastUI = [
    '            {decisionRaw?.war_room_v2?.forecast && (',
    '              <div className="rounded-md border border-purple-500/30 bg-slate-900 p-5 space-y-4 text-slate-200">',
    '                <div className="flex items-center justify-between">',
    '                  <h2 className="text-sm font-bold uppercase tracking-widest text-purple-400">Prediction vs Actual Calibration</h2>',
    '                  <span className="text-xs text-purple-400 bg-purple-500/10 px-2 py-1 rounded font-bold tracking-widest leading-none">CONFIDENCE: {decisionRaw.war_room_v2.forecast.confidence}%</span>',
    '                </div>',
    '                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">',
    '                  <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">',
    '                    <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3 text-center">Schedule Index (SPI)</div>',
    '                    <div className="flex items-center justify-between px-4">',
    '                      <div className="flex flex-col items-center">',
    '                        <div className="text-slate-400 text-[10px] uppercase font-bold tracking-widest">Predicted</div>',
    '                        <div className="text-xl font-mono font-bold text-slate-200 mt-1">{decisionRaw.war_room_v2.forecast.predicted_schedule_index.toFixed(2)}</div>',
    '                      </div>',
    '                      <div className="text-slate-600 font-bold tracking-widest text-sm">VS</div>',
    '                      <div className="flex flex-col items-center">',
    '                        <div className="text-slate-400 text-[10px] uppercase font-bold tracking-widest">Actual</div>',
    '                        <div className="text-xl font-mono font-bold text-slate-200 mt-1">{result.schedule_index.toFixed(2)}</div>',
    '                      </div>',
    '                    </div>',
    '                    <div className="mt-4 text-center text-[11px] font-bold tracking-widest uppercase px-2 py-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-300">',
    '                      Diff: {Math.abs(decisionRaw.war_room_v2.forecast.predicted_schedule_index - result.schedule_index).toFixed(2)}',
    '                    </div>',
    '                  </div>',
    '                  ',
    '                  <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">',
    '                    <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-3 text-center">Cost Index (CPI)</div>',
    '                    <div className="flex items-center justify-between px-4">',
    '                      <div className="flex flex-col items-center">',
    '                        <div className="text-slate-400 text-[10px] uppercase font-bold tracking-widest">Predicted</div>',
    '                        <div className="text-xl font-mono font-bold text-slate-200 mt-1">{decisionRaw.war_room_v2.forecast.predicted_cost_index.toFixed(2)}</div>',
    '                      </div>',
    '                      <div className="text-slate-600 font-bold tracking-widest text-sm">VS</div>',
    '                      <div className="flex flex-col items-center">',
    '                        <div className="text-slate-400 text-[10px] uppercase font-bold tracking-widest">Actual</div>',
    '                        <div className="text-xl font-mono font-bold text-slate-200 mt-1">{result.cost_index.toFixed(2)}</div>',
    '                      </div>',
    '                    </div>',
    '                    <div className="mt-4 text-center text-[11px] font-bold tracking-widest uppercase px-2 py-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-300">',
    '                      Diff: {Math.abs(decisionRaw.war_room_v2.forecast.predicted_cost_index - result.cost_index).toFixed(2)}',
    '                    </div>',
    '                  </div>',
    '                </div>',
    '                <p className="text-[11px] text-purple-400/70 italic mt-2 border-t border-purple-500/20 pt-3">Calibration note: Your ability to accurately forecast outcomes based on strategic intent will be judged in later scenarios.</p>',
    '              </div>',
    '            )}',
    ''
  ];
  
  lines.splice(insertIdx, 0, ...forecastUI);
}

fs.writeFileSync(path, lines.join('\\n'));
console.log("Patched Results Forecast.");
