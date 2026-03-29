const fs = require('fs');

const path = 'app/sessions/[sessionId]/round/[roundNumber]/page.tsx';
let lines = fs.readFileSync(path, 'utf8').split(/\r?\n/);

const importIdx = lines.findIndex(l => l.includes('import { parseConstructionEvents }'));
if (importIdx !== -1 && !lines.some(l => l.includes('getRoundEvents'))) {
  lines.splice(importIdx + 1, 0, 'import { getRoundEvents, GameEvent } from "@/lib/eventDeck";');
}

const unsavedIdx = lines.findIndex(l => l.includes('const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);'));
if (unsavedIdx !== -1 && !lines.some(l => l.includes('deckEvents'))) {
  const insert = [
    '  const deckEvents = useMemo(() => {',
    '    if (!sessionId || !teamId || !roundNumber) return [];',
    '    return getRoundEvents(sessionId, teamId, roundNumber);',
    '  }, [sessionId, teamId, roundNumber]);',
    '  const [eventsChosen, setEventsChosen] = useState<Record<string, string>>({});'
  ];
  lines.splice(unsavedIdx, 0, ...insert);
}

const buildStepIdx = lines.findIndex(l => l.includes('function buildStepTimingSnapshot'));
if (buildStepIdx !== -1 && !lines.some(l => l.includes('updateEventChoice'))) {
  const insert = [
    '  function updateEventChoice(eventId: string, choiceId: string) {',
    '    setHasUnsavedChanges(true);',
    '    setEventsChosen((prev) => ({ ...prev, [eventId]: choiceId }));',
    '  }',
    ''
  ];
  lines.splice(buildStepIdx, 0, ...insert);
}

const savedStepRawIdx = lines.findIndex(l => l.includes('const savedStepRaw = (existing.raw'));
if (savedStepRawIdx !== -1 && !lines.some(l => l.includes('warRoomV2'))) {
  const insert = [
    '        const warRoomV2 = existing.raw?.war_room_v2 as any;',
    '        if (warRoomV2 && Array.isArray(warRoomV2.eventsChosen)) {',
    '          const initChosen: Record<string, string> = {};',
    '          warRoomV2.eventsChosen.forEach((ec: any) => {',
    '            if (ec.eventId && ec.choiceId) initChosen[ec.eventId] = ec.choiceId;',
    '          });',
    '          setEventsChosen(initChosen);',
    '        }',
    ''
  ];
  lines.splice(savedStepRawIdx, 0, ...insert);
}

const rawEventsIdxs = [];
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('events: resolvedRoundEvents,')) {
    rawEventsIdxs.push(i);
  }
}
let shifted = 0;
for (const idx of rawEventsIdxs) {
  if (!lines[idx + shifted + 1].includes('war_room_v2: {')) {
    const insert = [
    '            war_room_v2: {',
    '              eventsShown: deckEvents.map(e => e.id),',
    '              eventsChosen: Object.entries(eventsChosen).map(([eventId, choiceId]) => ({ eventId, choiceId }))',
    '            },'
    ];
    lines.splice(idx + shifted + 1, 0, ...insert);
    shifted += insert.length;
  }
}

const externalContextIdx = lines.findIndex(l => l.includes('>Live External Context<') && l.includes('uppercase'));
if (externalContextIdx !== -1 && !lines.some(l => l.includes('Event Deck (Action Required)'))) {
  let insertIdx = externalContextIdx;
  while(insertIdx > 0 && !lines[insertIdx].includes('className="p-5')) {
    insertIdx--;
  }
  const deckUI = [
    '                        {deckEvents.length > 0 && (',
    '                          <div className="p-5 rounded-2xl bg-slate-900/40 border border-teal-500/30 space-y-4">',
    '                            <div className="text-[10px] font-bold uppercase tracking-widest text-teal-500 flex items-center justify-between">',
    '                              <span>Event Deck (Action Required)</span>',
    '                              <span className="text-teal-400/50">{Object.keys(eventsChosen).length}/{deckEvents.length} Decided</span>',
    '                            </div>',
    '                            <div className="space-y-6">',
    '                              {deckEvents.map(evt => (',
    '                                <div key={evt.id} className="space-y-3 p-4 rounded-xl bg-slate-950/50 border border-slate-800">',
    '                                  <div>',
    '                                    <div className="font-bold text-slate-200">{evt.title}</div>',
    '                                    <div className="text-xs text-slate-400 mt-1 leading-relaxed">{evt.description}</div>',
    '                                  </div>',
    '                                  <div className="pt-2">',
    '                                    <SegmentedControl',
    '                                      options={evt.choices.map(c => ({ value: c.id, text: c.label, hint: c.theoryHint }))}',
    '                                      activeOption={eventsChosen[evt.id] || ""}',
    '                                      onSelect={(v) => updateEventChoice(evt.id, v)}',
    '                                      disabled={isLocked}',
    '                                    />',
    '                                  </div>',
    '                                </div>',
    '                              ))}',
    '                            </div>',
    '                          </div>',
    '                        )}',
    ''
  ];
  lines.splice(insertIdx, 0, ...deckUI);
}

fs.writeFileSync(path, lines.join('\n'));
console.log("Patched Events.");
