  const isLocked = locked || roundStatus !== "open" || lockBlockedByDeadline;

  return (
    <RequireAuth>
      <div className="flex flex-col min-h-[100dvh] pb-32 bg-[#020617] text-slate-300">
        {/* HEADER ZONE */}
        <header className="sticky top-[60px] z-40 bg-slate-950/80 backdrop-blur-md border-b border-white/5 px-4 py-3 shadow-lg">
          <div className="max-w-[1180px] mx-auto flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <Link className="text-slate-400 hover:text-white" href={`/sessions/${sessionId}`}>
                  <svg className="w-5 h-5 block" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                </Link>
                <h1 className="text-lg font-black text-white uppercase tracking-tight">Round {roundNumber} War Room</h1>
                {isLocked ? (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-widest bg-rose-500/20 text-rose-400 border border-rose-500/30">LOCKED</span>
                ) : (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-widest bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">DRAFTING</span>
                )}
              </div>
              <div className="mt-1 flex items-center gap-3 text-[10px] text-slate-500 uppercase tracking-widest font-semibold ml-8">
                <span>{teamName}</span>
                <span>•</span>
                <span>Readiness: {readinessScore}%</span>
              </div>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-slate-500 uppercase tracking-widest text-[9px]">Clock Source: {roundClockSource}</span>
              <span className={`font-bold text-lg font-mono leading-none ${lockWindowExpired ? "text-rose-400" : "text-emerald-400"}`}>
                {msLeft === null ? "--:--" : formatClock(msLeft)}
              </span>
            </div>
          </div>
        </header>

        {/* MAIN ZONE */}
        <main className="w-full max-w-[1180px] mx-auto p-4 md:p-6 space-y-6">
          {error && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-400 shadow-inner">
              {error}
            </div>
          )}
          {loading ? (
             <div className="animate-pulse flex flex-col gap-4">
               <div className="h-10 w-48 bg-slate-800 rounded-lg" />
               <div className="h-64 rounded-xl bg-slate-900/50 border border-white/5" />
             </div>
          ) : (
             <div className="grid grid-cols-1 lg:grid-cols-[1fr_minmax(0,340px)] gap-6">
                <div className="space-y-6">
                   {/* TAB BAR */}
                   <div className="overflow-x-auto pb-2 scrollbar-hide">
                     <div className="flex gap-2 min-w-max">
                       {stepTitles.map((title, index) => {
                         const idx = index as StepIndex;
                         const current = activeStep === idx;
                         const unlocked = availableStep(idx);
                         return (
                           <button
                             key={title}
                             onClick={() => setActiveStep(idx)}
                             disabled={!unlocked}
                             className={`px-5 py-2.5 rounded-lg text-[11px] font-bold uppercase tracking-widest transition-all ${
                               current ? "bg-blue-600 text-white shadow-lg shadow-blue-500/20 border border-white/10" : "bg-slate-900/50 text-slate-400 border border-transparent hover:bg-slate-800"
                             } ${!unlocked && "opacity-30 cursor-not-allowed"}`}
                           >
                             {String(index+1).padStart(2,"0")} <span className="opacity-50 mx-1">/</span> {title}
                           </button>
                         );
                       })}
                     </div>
                   </div>

                   {/* TAB CONTENT: STEP 1 */}
                   {activeStep === 0 && (
                     <div className="space-y-6 animate-in fade-in duration-300">
                        <div className="p-5 rounded-2xl bg-slate-900/40 border border-white/5 space-y-4">
                          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Team KPI Target (4x points)</div>
                          {teamKpiTarget ? (
                            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400 font-bold shadow-inner flex justify-between items-center">
                              <span>LOCKED TARGET // {teamKpiTarget}</span>
                              {savingKpiTarget && <span className="text-emerald-400 animate-pulse text-xs">SAVING...</span>}
                            </div>
                          ) : roundNumber === 1 ? (
                            <div className="space-y-4">
                              <SegmentedControl options={KPI_TARGET_OPTIONS.map(k=>({value:k.value,text:k.value,hint:k.thresholdLabel}))} activeOption={draftKpiTarget} onSelect={setDraftKpiTarget} disabled={isLocked} />
                              <div className="pt-2"><Button variant="secondary" onClick={saveKpiTargetNow} disabled={isLocked || !draftKpiTarget || savingKpiTarget}>{savingKpiTarget ? "SAVING..." : "LOCK KPI TARGET"}</Button></div>
                            </div>
                          ) : (
                            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-400 shadow-inner">KPI TARGET NOT SET IN R1</div>
                          )}
                        </div>

                        <div className="p-5 rounded-2xl bg-slate-900/40 border border-white/5 space-y-4">
                          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Live External Context</div>
                          <SegmentedControl options={externalContextOptions.map(o=>({value:o.value,text:o.text}))} activeOption={form.external_context} onSelect={(v)=>update("external_context",v)} disabled={isLocked} />
                        </div>

                        <div className="p-5 rounded-2xl bg-slate-900/40 border border-white/5 space-y-4">
                          <div className="flex items-center justify-between">
                            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Focus Allocation</div>
                            <div className={`text-[10px] font-mono font-bold ${focusSum===100?"text-emerald-400":"text-rose-400"}`}>TOTAL: {focusSum}/100</div>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <DecisionSlider label="Cost Focus" value={form.focus_cost} min={0} max={100} onChange={v=>update("focus_cost",v)} disabled={isLocked} />
                            <DecisionSlider label="Quality Focus" value={form.focus_quality} min={0} max={100} onChange={v=>update("focus_quality",v)} disabled={isLocked} />
                            <DecisionSlider label="Stakeholder Focus" value={form.focus_stakeholder} min={0} max={100} onChange={v=>update("focus_stakeholder",v)} disabled={isLocked} />
                            <DecisionSlider label="Speed Focus" value={form.focus_speed} min={0} max={100} onChange={v=>update("focus_speed",v)} disabled={isLocked} />
                          </div>
                        </div>
                        
                        <div className="p-5 rounded-2xl bg-slate-900/40 border border-white/5 space-y-4">
                          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Strategic Posture</div>
                          <SegmentedControl options={postureOptions.map(o=>({value:o.value,text:o.text}))} activeOption={form.strategic_posture} onSelect={(v)=>update("strategic_posture",v)} disabled={isLocked} />
                        </div>
                     </div>
                   )}

                   {/* TAB CONTENT: STEP 2 */}
                   {activeStep === 1 && (
                     <div className="space-y-6 animate-in fade-in duration-300">
                        <div className="p-5 rounded-2xl bg-slate-900/40 border border-white/5 space-y-4">
                          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Sector Selection</div>
                          <SegmentedControl options={sectorOptions.map(o=>({value:o.value,text:o.text}))} activeOption={form.primary_sector} onSelect={(v)=>update("primary_sector",v)} disabled={isLocked} />
                          <div className="mt-4 flex flex-col bg-slate-950/50 rounded-xl p-4 border border-white/5">
                            <span className="text-[10px] uppercase font-bold tracking-widest text-slate-500 mb-2">Secondary Sector</span>
                            <select className="w-full rounded-lg bg-slate-900 border border-slate-700 px-4 py-3 text-sm font-semibold text-white focus:border-blue-500 outline-none" value={form.secondary_sector} disabled={isLocked} onChange={e=>update("secondary_sector",e.target.value as SecondarySector)}>
                               {secondarySectorOptions.map(o=><option key={o} value={o}>{o}</option>)}
                            </select>
                          </div>
                        </div>

                        <div className="p-5 rounded-2xl bg-slate-900/40 border border-white/5 space-y-4">
                          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Market Expansion</div>
                          <SegmentedControl options={expansionOptions.map(o=>({value:o.value,text:o.text}))} activeOption={form.market_expansion} onSelect={(v)=>update("market_expansion",v)} disabled={isLocked} />
                        </div>

                        <div className="p-5 rounded-2xl bg-slate-900/40 border border-white/5 space-y-4">
                          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Portfolio Posture</div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <DecisionSlider label="Bid Aggressiveness" value={form.bid_aggressiveness} min={1} max={5} onChange={v=>update("bid_aggressiveness",v)} disabled={isLocked} />
                            <DecisionSlider label="Public Project Mix" value={form.project_mix_public_pct} min={0} max={100} suffix="%" onChange={v=>update("project_mix_public_pct",v)} disabled={isLocked} />
                          </div>
                        </div>

                        <div className="p-5 rounded-2xl bg-slate-900/40 border border-white/5 space-y-4">
                          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Governance & Risk</div>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="flex flex-col"><span className="text-[10px] uppercase font-bold tracking-widest text-slate-500 mb-2">Risk Appetite</span><select className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-white font-semibold outline-none" value={form.risk_appetite} disabled={isLocked} onChange={e=>update("risk_appetite",e.target.value as RiskAppetite)}>{riskOptions.map(o=><option key={o} value={o}>{o}</option>)}</select></div>
                            <div className="flex flex-col"><span className="text-[10px] uppercase font-bold tracking-widest text-slate-500 mb-2">Gov Intensity</span><select className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-white font-semibold outline-none" value={form.governance_intensity} disabled={isLocked} onChange={e=>update("governance_intensity",e.target.value as Governance)}>{governanceOptions.map(o=><option key={o} value={o}>{o}</option>)}</select></div>
                            <div className="flex flex-col"><span className="text-[10px] uppercase font-bold tracking-widest text-slate-500 mb-2">Message Tone</span><select className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-white font-semibold outline-none" value={form.public_message_tone} disabled={isLocked} onChange={e=>update("public_message_tone",e.target.value as MessageTone)}>{messageToneOptions.map(o=><option key={o} value={o}>{o}</option>)}</select></div>
                          </div>
                        </div>
                     </div>
                   )}

                   {/* TAB CONTENT: STEP 3 */}
                   {activeStep === 2 && (
                     <div className="space-y-6 animate-in fade-in duration-300">
                        <div className="p-5 rounded-2xl bg-slate-900/40 border border-white/5 space-y-4">
                          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Delivery Mix & Assets</div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <DecisionSlider label="Self-Perform Share" value={form.self_perform_percent} min={0} max={100} suffix="%" onChange={v=>update("self_perform_percent",v)} disabled={isLocked} />
                            <DecisionSlider label="P&M Utilization Target" value={form.pm_utilization_target} min={40} max={95} suffix="%" onChange={v=>update("pm_utilization_target",v)} disabled={isLocked} />
                            <DecisionSlider label="Specialized Capability" value={form.specialized_work_index} min={0} max={100} onChange={v=>update("specialized_work_index",v)} disabled={isLocked} />
                            <DecisionSlider label="Work-Life Balance" value={form.work_life_balance_index} min={0} max={100} onChange={v=>update("work_life_balance_index",v)} disabled={isLocked} />
                          </div>
                        </div>
                        <div className="p-5 rounded-2xl bg-slate-900/40 border border-white/5 space-y-4">
                          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Subcontractor Profile</div>
                          <SegmentedControl options={subcontractorOptions.map(o=>({value:o.value,text:o.text,hint:o.hint}))} activeOption={form.subcontractor_profile} onSelect={(v)=>update("subcontractor_profile",v)} disabled={isLocked} />
                        </div>
                        <div className="p-5 rounded-2xl bg-slate-900/40 border border-white/5 space-y-4">
                          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Workforce Dynamics</div>
                          <SegmentedControl options={workforceOptions.map(o=>({value:o.value,text:o.text}))} activeOption={form.workforce_plan} onSelect={(v)=>update("workforce_plan",v)} disabled={isLocked} />
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                            <div className="flex flex-col"><span className="text-[10px] uppercase font-bold tracking-widest text-slate-500 mb-2">Load State</span><select className="w-full rounded-lg bg-slate-900 border border-slate-700 px-4 py-3 text-sm text-white font-semibold outline-none" value={form.workforce_load_state} disabled={isLocked} onChange={e=>update("workforce_load_state",e.target.value as WorkforceLoadState)}>{workloadOptions.map(o=><option key={o} value={o}>{o}</option>)}</select></div>
                            <div className="flex flex-col"><span className="text-[10px] uppercase font-bold tracking-widest text-slate-500 mb-2">QA Frequency</span><select className="w-full rounded-lg bg-slate-900 border border-slate-700 px-4 py-3 text-sm text-white font-semibold outline-none" value={form.qa_audit_frequency} disabled={isLocked} onChange={e=>update("qa_audit_frequency",e.target.value as QaFrequency)}>{qaOptions.map(o=><option key={o} value={o}>{o}</option>)}</select></div>
                          </div>
                        </div>
                        <div className="p-5 rounded-2xl bg-slate-900/40 border border-white/5 space-y-4">
                          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Overtime Policy</div>
                          <SegmentedControl options={overtimeOptions.map(o=>({value:o.value,text:o.text}))} activeOption={form.overtime_policy} onSelect={(v)=>update("overtime_policy",v)} disabled={isLocked} />
                        </div>
                        <div className="p-5 rounded-2xl bg-slate-900/40 border border-white/5 space-y-4">
                          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">L&D and Innovation</div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <DecisionSlider label="Training Intensity" value={form.training_intensity} min={0} max={100} onChange={v=>update("training_intensity",v)} disabled={isLocked} />
                            <DecisionSlider label="Innovation Budget" value={form.innovation_budget_index} min={0} max={100} onChange={v=>update("innovation_budget_index",v)} disabled={isLocked} />
                          </div>
                        </div>
                     </div>
                   )}

                   {/* TAB CONTENT: STEP 4 */}
                   {activeStep === 3 && (
                     <div className="space-y-6 animate-in fade-in duration-300">
                        <div className="p-5 rounded-2xl bg-slate-900/40 border border-white/5 space-y-4">
                          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Logistics & Buffer</div>
                          <SegmentedControl options={logisticsOptions.map(o=>({value:o.value,text:o.text}))} activeOption={form.logistics_resilience} onSelect={(v)=>update("logistics_resilience",v)} disabled={isLocked} />
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                            <DecisionSlider label="Buffer" value={form.buffer_percent} min={0} max={15} suffix="%" onChange={v=>update("buffer_percent",v)} disabled={isLocked} />
                            <DecisionSlider label="Inventory Cover" value={form.inventory_cover_weeks} min={1} max={12} suffix="w" onChange={v=>update("inventory_cover_weeks",v)} disabled={isLocked} />
                          </div>
                        </div>
                        <div className="p-5 rounded-2xl bg-slate-900/40 border border-white/5 space-y-4">
                          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Stakeholder Engagement</div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <DecisionSlider label="Community Engagement" value={form.community_engagement} min={0} max={100} onChange={v=>update("community_engagement",v)} disabled={isLocked} />
                            <DecisionSlider label="Digital Visibility Spend" value={form.digital_visibility_spend} min={0} max={100} onChange={v=>update("digital_visibility_spend",v)} disabled={isLocked} />
                            <DecisionSlider label="CSR & Sustainability" value={form.csr_sustainability_index} min={0} max={100} onChange={v=>update("csr_sustainability_index",v)} disabled={isLocked} />
                            <DecisionSlider label="Facilitation Risk Budget" value={form.facilitation_budget_index} min={0} max={100} onChange={v=>update("facilitation_budget_index",v)} disabled={isLocked} />
                          </div>
                        </div>
                        <div className="p-5 rounded-2xl bg-slate-900/40 border border-white/5 space-y-4">
                          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Compliance & Transparency</div>
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                             <div className="flex flex-col"><span className="text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-2">Compliance Posture</span><select className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-white font-semibold outline-none" value={form.compliance_posture} disabled={isLocked} onChange={e=>update("compliance_posture",e.target.value as CompliancePosture)}>{complianceOptions.map(o=><option key={o} value={o}>{o}</option>)}</select></div>
                             <div className="flex flex-col"><span className="text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-2">Vendor Strategy</span><select className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-sm text-white font-semibold outline-none" value={form.vendor_strategy} disabled={isLocked} onChange={e=>update("vendor_strategy",e.target.value as VendorStrategy)}>{vendorOptions.map(o=><option key={o} value={o}>{o}</option>)}</select></div>
                             <div className="flex flex-col lg:col-span-1 md:col-span-2"><span className="text-[10px] uppercase font-bold tracking-widest text-slate-500 mb-2">Transparency Mode</span><SegmentedControl options={transparencyOptions.map(o=>({value:o.value,text:o.text}))} activeOption={form.transparency_level} onSelect={(v)=>update("transparency_level",v)} disabled={isLocked} /></div>
                          </div>
                        </div>
                     </div>
                   )}

                   {/* TAB CONTENT: STEP 5 */}
                   {activeStep === 4 && (
                     <div className="space-y-6 animate-in fade-in duration-300">
                        <div className="p-5 rounded-2xl bg-slate-900/40 border border-white/5 space-y-4">
                           <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Financing Strategy</div>
                           <SegmentedControl options={financingOptions.map(o=>({value:o.value,text:o.text}))} activeOption={form.financing_posture} onSelect={(v)=>update("financing_posture",v)} disabled={isLocked} />
                           <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                             <DecisionSlider label="Cash Buffer" value={form.cash_buffer_months} min={1} max={12} suffix="m" onChange={v=>update("cash_buffer_months",v)} disabled={isLocked} />
                             <DecisionSlider label="Contingency Fund" value={form.contingency_fund_percent} min={0} max={20} suffix="%" onChange={v=>update("contingency_fund_percent",v)} disabled={isLocked} />
                           </div>
                        </div>
                        <div className="p-5 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-4">
                           <div className="text-[10px] font-bold uppercase tracking-widest text-amber-500">Deterministic Preview</div>
                           <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                             <div className="flex flex-col"><span className="text-[10px] uppercase text-amber-500/70">SPI Projection</span><span className="text-xl font-mono font-bold text-amber-400">{previewResult.schedule_index.toFixed(2)}</span></div>
                             <div className="flex flex-col"><span className="text-[10px] uppercase text-amber-500/70">CPI Projection</span><span className="text-xl font-mono font-bold text-amber-400">{previewResult.cost_index.toFixed(2)}</span></div>
                             <div className="flex flex-col"><span className="text-[10px] uppercase text-amber-500/70">Points Expected</span><span className="text-xl font-mono font-bold text-amber-400">+{Math.round(previewResult.points_earned)}</span></div>
                           </div>
                        </div>
                     </div>
                   )}
                </div>

                {/* SIDEBAR ZONE */}
                <div className="w-full shrink-0 flex flex-col gap-6 lg:sticky lg:top-28">
                  <div className="p-5 rounded-2xl bg-slate-900/60 border border-white/5">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-4">Readiness Protocol</div>
                    <div className="space-y-2">
                       {readinessChecks.map((check) => (
                         <div key={check.label} className="text-xs flex items-center justify-between gap-2">
                           <span className={check.pass ? "text-slate-300" : "text-amber-500 font-semibold"}>{check.label}</span>
                           <span className={`w-2 h-2 rounded-full flex-shrink-0 ${check.pass ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-rose-500"}`}></span>
                         </div>
                       ))}
                    </div>
                  </div>
                </div>
             </div>
          )}
        </main>

        {/* FOOTER CTA ZONE (Sticky) */}
        {!loading && (
          <footer className="fixed bottom-0 left-0 right-0 z-50 bg-[#020617]/90 backdrop-blur-xl border-t border-white/10 p-4 shadow-[0_-20px_40px_rgba(0,0,0,0.5)]">
            <div className="max-w-[1180px] mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="flex items-center justify-between md:justify-start w-full md:w-auto gap-4">
                <Button variant="ghost" onClick={prevStep} disabled={activeStep === 0 || isLocked} className="text-slate-400 hover:text-white">
                  &lt; Previous
                </Button>
                <div className="hidden md:flex flex-row gap-1">
                  {[0,1,2,3,4].map(idx => (
                     <div key={idx} className={`w-8 h-2 rounded-full transition-all ${activeStep === idx ? "bg-blue-500" : activeStep > idx ? "bg-blue-900" : "bg-slate-800"}`} />
                  ))}
                </div>
                <Button variant="ghost" onClick={nextStep} disabled={activeStep === 4 || !stepValidations[activeStep] || isLocked} className="text-slate-400 hover:text-white">
                  Next &gt;
                </Button>
              </div>

              <div className="flex flex-col md:flex-row md:items-center gap-3 w-full md:w-auto">
                 {isLocked ? (
                   <Link href={`/sessions/${sessionId}/round/${roundNumber}/results`} className="w-full md:w-auto">
                     <Button className="w-full md:w-auto bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/20 border-emerald-500 font-bold uppercase tracking-widest text-[11px] py-3">
                       VIEW IMPACT REPORT
                     </Button>
                   </Link>
                 ) : (
                   <>
                     <div className="flex items-center justify-center md:justify-end pr-2 font-mono text-[10px] font-bold tracking-widest">
                       {hasUnsavedChanges ? (
                         <span className="text-amber-400 animate-pulse uppercase">Unsaved Draft</span>
                       ) : (
                         <span className="text-emerald-500 uppercase">Input Accepted</span>
                       )}
                     </div>
                     <Button variant="secondary" onClick={saveDraft} disabled={saving || isLocked} className="w-full md:w-auto border-slate-700 bg-slate-900 text-slate-300 py-3 text-[11px] tracking-widest">
                       {saving ? "SAVING..." : "SAVE DRAFT"}
                     </Button>
                     <Button onClick={lockAndGenerateResults} disabled={locking || saving || isLocked || !stepValidations[4]} className="w-full md:w-auto shadow-blue-500/40 py-3 text-[11px] tracking-widest">
                       {locking ? "INITIALIZING..." : lockBlockedByDeadline ? "WINDOW CLOSED" : "LOCK & RUN SIMULATION"}
                     </Button>
                   </>
                 )}
              </div>
            </div>
          </footer>
        )}
      </div>
    </RequireAuth>
  );
