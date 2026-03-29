"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import RequireAuth from "@/components/RequireAuth";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { Page, PageSubTitle, PageTitle } from "@/components/ui/Page";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Alert } from "@/components/ui/Alert";

type RouteParams = { sessionId?: string };
type StepIndex = 0 | 1 | 2 | 3;
type RoleName =
  | "Project Director"
  | "Finance & Contracts Head"
  | "HSE Manager"
  | "Planning Manager";
type PositioningName =
  | "Cost Leadership"
  | "Quality & Compliance"
  | "Relationship & Escalation";

type IdentityProfile = {
  company_name?: string;
  tagline?: string;
  roles?: Partial<Record<RoleName, string>>;
  positioning_strategy?: PositioningName;
  kpi_targets?: string[];
  primary_kpi?: string;
};

type SessionRow = { id: string; name: string | null; code: string; current_round: number };
type MembershipRow = { team_id: string };
type TeamRow = {
  id: string;
  team_name: string | null;
  identity_profile: IdentityProfile | null;
  identity_completed: boolean;
  scenario_id: string | null;
};
type TeamMemberRow = { user_id: string; team_role: string | null; is_team_lead: boolean | null };
type TeamMemberOption = { key: string; label: string };
type RoundStatusRow = { status: string | null };
type ScenarioRow = {
  id: string;
  name: string;
  client: string;
  description: string | null;
  base_budget_cr: number | string | null;
  duration_rounds: number | null;
  complexity: "moderate" | "high" | "extreme";
};

const ROLE_NAMES: RoleName[] = [
  "Project Director",
  "Finance & Contracts Head",
  "HSE Manager",
  "Planning Manager",
];

const STEP_TITLES = [
  "Company Profile",
  "Project Selection",
  "Competitive Positioning",
  "KPI Target Selection",
] as const;

const POSITIONING_OPTIONS: Array<{ value: PositioningName; title: string; subtitle: string; tone: string }> = [
  {
    value: "Cost Leadership",
    title: "Cost Leadership",
    subtitle: "Win on price. Tight margins, high volume, lean operations.",
    tone: "from-sky-500/20 via-cyan-500/10 to-slate-950",
  },
  {
    value: "Quality & Compliance",
    title: "Quality & Compliance",
    subtitle: "Win on delivery. Zero defects, full documentation, client trust.",
    tone: "from-emerald-500/20 via-teal-500/10 to-slate-950",
  },
  {
    value: "Relationship & Escalation",
    title: "Relationship & Escalation",
    subtitle: "Win on networks. Client intimacy, fast issue resolution.",
    tone: "from-amber-500/20 via-orange-500/10 to-slate-950",
  },
];

const KPI_OPTIONS = [
  ["Schedule Performance Index (SPI)", "Are you delivering on time?"],
  ["Cost Performance Index (CPI)", "Are you delivering within budget?"],
  ["Safety Score", "Incident-free execution"],
  ["Stakeholder Satisfaction", "Client and community relations"],
  ["Quality Compliance Rate", "Snag-free handovers"],
] as const;

const EMPTY_ROLES: Record<RoleName, string> = {
  "Project Director": "",
  "Finance & Contracts Head": "",
  "HSE Manager": "",
  "Planning Manager": "",
};

function normalizeProfile(raw: IdentityProfile | null): IdentityProfile {
  if (!raw || typeof raw !== "object") return { roles: { ...EMPTY_ROLES }, kpi_targets: [] };
  const roles = { ...EMPTY_ROLES };
  for (const role of ROLE_NAMES) {
    roles[role] = typeof raw.roles?.[role] === "string" ? raw.roles[role]! : "";
  }
  return {
    company_name: typeof raw.company_name === "string" ? raw.company_name : "",
    tagline: typeof raw.tagline === "string" ? raw.tagline : "",
    roles,
    positioning_strategy:
      raw.positioning_strategy && POSITIONING_OPTIONS.some((option) => option.value === raw.positioning_strategy)
        ? raw.positioning_strategy
        : undefined,
    kpi_targets: Array.isArray(raw.kpi_targets)
      ? raw.kpi_targets.filter((value): value is string => typeof value === "string")
      : [],
    primary_kpi: typeof raw.primary_kpi === "string" ? raw.primary_kpi : "",
  };
}

function dedupe(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function formatBudget(value: number | string | null) {
  if (value === null || value === undefined || value === "") return "TBD";
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return "TBD";
  return `Rs ${numeric.toFixed(0)} Cr`;
}

function complexityClasses(complexity: ScenarioRow["complexity"]) {
  if (complexity === "extreme") return "border-rose-400/30 bg-rose-500/10 text-rose-200";
  if (complexity === "high") return "border-amber-400/30 bg-amber-500/10 text-amber-100";
  return "border-emerald-400/30 bg-emerald-500/10 text-emerald-100";
}

function resolveInitialStep(profile: IdentityProfile, scenarioId: string | null): StepIndex {
  const companyReady =
    Boolean(profile.company_name?.trim()) &&
    Boolean(profile.tagline?.trim()) &&
    ROLE_NAMES.every((role) => Boolean(profile.roles?.[role]?.trim()));
  if (!companyReady) return 0;
  if (!scenarioId) return 1;
  if (!profile.positioning_strategy) return 2;
  if ((profile.kpi_targets?.length ?? 0) !== 3 || !profile.primary_kpi) return 3;
  return 3;
}

function isIdentityWindowClosed(currentRound: number, roundStatus: string | null) {
  if (currentRound > 1) return true;
  if (currentRound === 1 && roundStatus && !["pending", "open"].includes(roundStatus)) return true;
  return false;
}

function StepChip({ active, complete, index, title }: { active: boolean; complete: boolean; index: number; title: string }) {
  return (
    <div
      className={`rounded-2xl border px-4 py-3 ${
        active
          ? "border-amber-400/40 bg-amber-500/10"
          : complete
            ? "border-emerald-400/30 bg-emerald-500/10"
            : "border-white/10 bg-slate-950/70"
      }`}
    >
      <div className="flex items-center gap-3">
        <div
          className={`flex h-9 w-9 items-center justify-center rounded-full border text-xs font-black ${
            active
              ? "border-amber-300 bg-amber-400/15 text-amber-100"
              : complete
                ? "border-emerald-300 bg-emerald-400/15 text-emerald-100"
                : "border-white/10 bg-white/5 text-slate-400"
          }`}
        >
          {complete ? "OK" : `0${index + 1}`}
        </div>
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">Step {index + 1}</div>
          <div className="truncate text-sm font-semibold text-white">{title}</div>
        </div>
      </div>
    </div>
  );
}

export default function SessionIdentityPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseClient(), []);
  const routeParams = params as RouteParams;
  const sessionId = routeParams.sessionId ?? "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saveNotice, setSaveNotice] = useState("");
  const [saving, setSaving] = useState(false);

  const [sessionName, setSessionName] = useState("");
  const [sessionCode, setSessionCode] = useState("");
  const [currentRound, setCurrentRound] = useState(0);
  const [roundStatus, setRoundStatus] = useState<string | null>(null);
  const [teamId, setTeamId] = useState("");
  const [teamName, setTeamName] = useState("");
  const [identityProfile, setIdentityProfile] = useState<IdentityProfile>({});
  const [memberOptions, setMemberOptions] = useState<TeamMemberOption[]>([]);
  const [scenarios, setScenarios] = useState<ScenarioRow[]>([]);
  const [stepIndex, setStepIndex] = useState<StepIndex>(0);

  const [companyName, setCompanyName] = useState("");
  const [tagline, setTagline] = useState("");
  const [roles, setRoles] = useState<Record<RoleName, string>>(EMPTY_ROLES);
  const [selectedScenarioId, setSelectedScenarioId] = useState("");
  const [positioningStrategy, setPositioningStrategy] = useState<PositioningName | "">("");
  const [selectedKpis, setSelectedKpis] = useState<string[]>([]);
  const [primaryKpi, setPrimaryKpi] = useState("");

  const stepCompletion = [
    Boolean(companyName.trim()) && Boolean(tagline.trim()) && ROLE_NAMES.every((role) => Boolean(roles[role]?.trim())),
    Boolean(selectedScenarioId),
    Boolean(positioningStrategy),
    selectedKpis.length === 3 && selectedKpis.includes(primaryKpi),
  ];

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError("");

      const { data: userData, error: userError } = await supabase.auth.getUser();
      const user = userData.user;
      if (userError || !user) {
        router.replace("/login");
        return;
      }

      const { data: sessionData, error: sessionError } = await supabase
        .from("sessions")
        .select("id,name,code,current_round")
        .eq("id", sessionId)
        .single();

      if (sessionError) {
        setError(sessionError.message);
        setLoading(false);
        return;
      }

      const { data: membershipRows, error: membershipError } = await supabase
        .from("team_memberships")
        .select("team_id")
        .eq("user_id", user.id);

      if (membershipError) {
        setError(membershipError.message);
        setLoading(false);
        return;
      }

      const teamIds = ((membershipRows ?? []) as MembershipRow[]).map((row) => row.team_id);
      const { data: teamRows, error: teamError } = await supabase
        .from("teams")
        .select("id,team_name,identity_profile,identity_completed,scenario_id")
        .in("id", teamIds)
        .eq("session_id", sessionId);

      if (teamError) {
        setError(teamError.message);
        setLoading(false);
        return;
      }

      const team = ((teamRows ?? []) as TeamRow[])[0];
      if (!team) {
        setError("You are not a member of this session.");
        setLoading(false);
        return;
      }

      const [{ data: roundData, error: roundError }, { data: memberRows, error: memberError }, { data: scenarioRows, error: scenarioError }] =
        await Promise.all([
          supabase.from("session_rounds").select("status").eq("session_id", sessionId).eq("round_number", 1).maybeSingle(),
          supabase.from("team_memberships").select("user_id,team_role,is_team_lead").eq("team_id", team.id),
          supabase
            .from("project_scenarios")
            .select("id,name,client,description,base_budget_cr,duration_rounds,complexity")
            .order("created_at", { ascending: true }),
        ]);

      if (roundError || memberError || scenarioError) {
        setError(roundError?.message ?? memberError?.message ?? scenarioError?.message ?? "Failed to load identity setup.");
        setLoading(false);
        return;
      }

      const session = sessionData as SessionRow;
      const roundRow = (roundData as RoundStatusRow | null) ?? null;
      const profile = normalizeProfile(team.identity_profile);
      const meLabel =
        (typeof user.user_metadata?.full_name === "string" && user.user_metadata.full_name) ||
        (typeof user.user_metadata?.name === "string" && user.user_metadata.name) ||
        user.email?.split("@")[0] ||
        "You";

      const roster = ((memberRows ?? []) as TeamMemberRow[]).map((member, index) => {
        if (member.user_id === user.id) return { key: member.user_id, label: `${meLabel} (You)` };
        if (member.team_role?.trim()) return { key: member.user_id, label: `${member.team_role.trim()} ${index + 1}` };
        if (member.is_team_lead) return { key: member.user_id, label: `Team Lead ${index + 1}` };
        return { key: member.user_id, label: `Member ${index + 1}` };
      });

      const options = dedupe([
        ...roster.map((member) => member.label),
        ...Object.values(profile.roles ?? {}).filter((value): value is string => typeof value === "string" && value.trim().length > 0),
      ]).map((label) => ({ key: label, label }));

      setSessionName(session.name ?? "Identity Setup");
      setSessionCode(session.code ?? "");
      setCurrentRound(session.current_round ?? 0);
      setRoundStatus(roundRow?.status ?? null);
      setTeamId(team.id);
      setTeamName(team.team_name ?? "Project Team");
      setIdentityProfile(profile);
      setMemberOptions(options.length > 0 ? options : [{ key: "Team Lead", label: "Team Lead" }]);
      setScenarios((scenarioRows ?? []) as ScenarioRow[]);
      setCompanyName(profile.company_name ?? "");
      setTagline(profile.tagline ?? "");
      setRoles({ ...EMPTY_ROLES, ...(profile.roles ?? {}) });
      setSelectedScenarioId(team.scenario_id ?? "");
      setPositioningStrategy(profile.positioning_strategy ?? "");
      setSelectedKpis(profile.kpi_targets ?? []);
      setPrimaryKpi(profile.primary_kpi ?? "");
      setStepIndex(resolveInitialStep(profile, team.scenario_id));

      if (team.identity_completed || isIdentityWindowClosed(session.current_round ?? 0, roundRow?.status ?? null)) {
        router.replace(`/sessions/${sessionId}`);
        return;
      }

      setLoading(false);
    })();
  }, [router, sessionId, supabase]);

  async function persistIdentityStep(
    profilePatch: Partial<IdentityProfile>,
    extraFields?: { scenario_id?: string; identity_completed?: boolean },
    successMessage?: string
  ) {
    if (!teamId) return false;
    setSaving(true);
    setSaveError("");
    setSaveNotice("");

    const nextProfile: IdentityProfile = { ...identityProfile, ...profilePatch };
    const updatePayload: { identity_profile: IdentityProfile; scenario_id?: string; identity_completed?: boolean } = {
      identity_profile: nextProfile,
    };
    if (extraFields?.scenario_id !== undefined) updatePayload.scenario_id = extraFields.scenario_id;
    if (extraFields?.identity_completed !== undefined) updatePayload.identity_completed = extraFields.identity_completed;

    const { error: updateError } = await supabase.from("teams").update(updatePayload).eq("id", teamId);
    if (updateError) {
      setSaveError(updateError.message);
      setSaving(false);
      return false;
    }

    setIdentityProfile(nextProfile);
    if (successMessage) setSaveNotice(successMessage);
    setSaving(false);
    return true;
  }

  async function handleContinue() {
    if (stepIndex === 0) {
      if (!stepCompletion[0]) {
        setSaveError("Complete company profile, tagline, and all four role assignments.");
        return;
      }
      const saved = await persistIdentityStep(
        { company_name: companyName.trim(), tagline: tagline.trim(), roles },
        undefined,
        "Company profile saved."
      );
      if (saved) setStepIndex(1);
      return;
    }

    if (stepIndex === 1) {
      if (!selectedScenarioId) {
        setSaveError("Select one project scenario to continue.");
        return;
      }
      const saved = await persistIdentityStep({}, { scenario_id: selectedScenarioId }, "Project scenario saved.");
      if (saved) setStepIndex(2);
      return;
    }

    if (stepIndex === 2) {
      if (!positioningStrategy) {
        setSaveError("Pick one competitive positioning strategy.");
        return;
      }
      const saved = await persistIdentityStep(
        { positioning_strategy: positioningStrategy },
        undefined,
        "Positioning strategy saved."
      );
      if (saved) setStepIndex(3);
      return;
    }

    if (!stepCompletion[3]) {
      setSaveError("Select exactly three KPI targets and mark one of them as primary.");
      return;
    }

    const saved = await persistIdentityStep(
      { kpi_targets: selectedKpis, primary_kpi: primaryKpi },
      { identity_completed: true },
      "Identity locked in."
    );
    if (saved) router.push(`/sessions/${sessionId}`);
  }

  function toggleKpi(value: string) {
    setSaveError("");
    setSaveNotice("");
    setSelectedKpis((current) => {
      if (current.includes(value)) {
        const next = current.filter((item) => item !== value);
        if (primaryKpi === value) setPrimaryKpi("");
        return next;
      }
      if (current.length >= 3) return current;
      return [...current, value];
    });
  }

  const progressPercent = ((stepIndex + 1) / STEP_TITLES.length) * 100;
  const selectedScenario = scenarios.find((scenario) => scenario.id === selectedScenarioId) ?? null;

  if (loading) {
    return (
      <RequireAuth>
        <Page>
          <div className="py-8">
            <div className="h-24 rounded-3xl border border-white/10 bg-slate-950/70" />
          </div>
        </Page>
      </RequireAuth>
    );
  }

  return (
    <RequireAuth>
      <Page>
        <div className="py-6 sm:py-8">
          <div className="space-y-6">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
              <div>
                <PageTitle>Identity Setup</PageTitle>
                <PageSubTitle>{teamName} | {sessionName}</PageSubTitle>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="rounded-full border border-white/10 bg-slate-950/70 px-4 py-2 text-xs font-bold uppercase tracking-[0.22em] text-slate-300">
                  Session {sessionCode || "--"}
                </div>
                <div className="rounded-full border border-amber-400/20 bg-amber-500/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.22em] text-amber-100">
                  Round {Math.max(currentRound, 1)} {roundStatus ? `| ${roundStatus}` : ""}
                </div>
                <Link
                  href={`/sessions/${sessionId}`}
                  className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold uppercase tracking-[0.22em] text-slate-300 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
                >
                  Exit
                </Link>
              </div>
            </div>

            {error ? <Alert variant="error">{error}</Alert> : null}

            <Card className="border-white/10 bg-slate-950/85">
              <CardBody className="space-y-5 px-6 py-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-amber-300">Round 1 Readiness</div>
                    <div className="mt-2 text-xl font-bold text-white">{STEP_TITLES[stepIndex]}</div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-right">
                    <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-500">Progress</div>
                    <div className="mt-1 text-lg font-black text-white">{stepIndex + 1}/4</div>
                  </div>
                </div>

                <div className="h-2 overflow-hidden rounded-full bg-white/5">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-amber-400 via-orange-400 to-rose-400 transition-all duration-500"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>

                <div className="grid gap-3 lg:grid-cols-4">
                  {STEP_TITLES.map((title, index) => (
                    <StepChip key={title} active={stepIndex === index} complete={stepCompletion[index]} index={index} title={title} />
                  ))}
                </div>
              </CardBody>
            </Card>

            <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
              <div className="space-y-6">
                <Card className="border-white/10 bg-slate-950/80">
                  <CardBody className="space-y-4 px-6 py-6">
                    <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">Company Shell</div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                      <div className="text-sm font-bold text-white">{companyName || teamName}</div>
                      <div className="mt-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                        {tagline || "Tagline pending"}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                      <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">Scenario</div>
                      <div className="mt-2 text-sm font-medium text-slate-200">
                        {selectedScenario ? `${selectedScenario.name} | ${selectedScenario.client}` : "Pending"}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                      <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">Strategy</div>
                      <div className="mt-2 text-sm font-medium text-slate-200">{positioningStrategy || "Pending"}</div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                      <div className="flex items-center justify-between">
                        <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">Primary KPI</div>
                        <span className="rounded-full bg-amber-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-amber-200">
                          x4
                        </span>
                      </div>
                      <div className="mt-2 text-sm font-medium text-slate-200">{primaryKpi || "Pending"}</div>
                    </div>
                  </CardBody>
                </Card>

                <Card className="border-white/10 bg-slate-950/80">
                  <CardBody className="space-y-3 px-6 py-6">
                    {["Profile", "Scenario", "Positioning", "Targets"].map((label, index) => (
                      <div key={label} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                        <span className="text-sm text-slate-300">{label}</span>
                        <span
                          className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] ${
                            stepCompletion[index]
                              ? "bg-emerald-500/15 text-emerald-100"
                              : "bg-slate-900 text-slate-500"
                          }`}
                        >
                          {stepCompletion[index] ? "Ready" : "Open"}
                        </span>
                      </div>
                    ))}
                  </CardBody>
                </Card>
              </div>

              <Card className="border-white/10 bg-slate-950/80">
                <CardBody className="px-6 py-6">
                  <div className="space-y-6">
                    {stepIndex === 0 ? (
                      <div className="space-y-6">
                        <div>
                          <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-500">Step 1</div>
                          <div className="mt-1 text-2xl font-black text-white">Company Profile</div>
                        </div>

                        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
                          <div className="space-y-5">
                            <div className="grid gap-5 md:grid-cols-2">
                              <label className="block">
                                <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">Company Name</span>
                                <Input
                                  value={companyName}
                                  onChange={(event) => setCompanyName(event.target.value)}
                                  placeholder="Apex Infrastructure Pvt. Ltd."
                                  className="mt-3 h-12 rounded-2xl border-white/10 bg-white/5 px-4 text-base"
                                />
                              </label>
                              <label className="block">
                                <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">Tagline</span>
                                <Input
                                  value={tagline}
                                  onChange={(event) => setTagline(event.target.value)}
                                  placeholder="Precision delivery at corridor scale."
                                  className="mt-3 h-12 rounded-2xl border-white/10 bg-white/5 px-4 text-base"
                                />
                              </label>
                            </div>

                            <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
                              <div className="flex items-center justify-between gap-3">
                                <div className="text-sm font-bold text-white">Role Assignment Matrix</div>
                                <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">4 Required</div>
                              </div>

                              <div className="mt-5 grid gap-4">
                                {ROLE_NAMES.map((role) => (
                                  <div
                                    key={role}
                                    className="grid gap-3 rounded-2xl border border-white/10 bg-slate-950/70 p-4 md:grid-cols-[minmax(0,1fr)_220px]"
                                  >
                                    <div className="min-w-0">
                                      <div className="text-sm font-semibold text-white">{role}</div>
                                      <div className="mt-1 text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">Functional owner</div>
                                    </div>

                                    <select
                                      value={roles[role]}
                                      onChange={(event) => setRoles((current) => ({ ...current, [role]: event.target.value }))}
                                      className="h-11 rounded-2xl border border-white/10 bg-white/5 px-4 text-sm font-semibold text-white outline-none transition focus:border-amber-400/40 focus:bg-white/10"
                                    >
                                      <option value="" className="bg-slate-950">
                                        Select owner
                                      </option>
                                      {memberOptions.map((member) => (
                                        <option key={`${role}-${member.key}`} value={member.label} className="bg-slate-950">
                                          {member.label}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>

                          <div className="rounded-3xl border border-white/10 bg-gradient-to-b from-white/10 to-white/5 p-5">
                            <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">Team Roster</div>
                            <div className="mt-4 space-y-3">
                              {memberOptions.map((member, index) => (
                                <div
                                  key={member.key}
                                  className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-3"
                                >
                                  <div className="text-sm font-medium text-slate-100">{member.label}</div>
                                  <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">
                                    {index === 0 ? "Roster 01" : `Roster 0${Math.min(index + 1, 9)}`}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : null}

                    {stepIndex === 1 ? (
                      <div className="space-y-6">
                        <div>
                          <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-500">Step 2</div>
                          <div className="mt-1 text-2xl font-black text-white">Project Selection</div>
                        </div>

                        <div className="grid gap-5 xl:grid-cols-2">
                          {scenarios.map((scenario) => {
                            const selected = selectedScenarioId === scenario.id;
                            return (
                              <button
                                key={scenario.id}
                                type="button"
                                onClick={() => setSelectedScenarioId(scenario.id)}
                                className={`overflow-hidden rounded-3xl border text-left transition ${
                                  selected
                                    ? "border-amber-400/40 bg-white/10 shadow-[0_24px_60px_rgba(251,191,36,0.12)]"
                                    : "border-white/10 bg-slate-950/70 hover:border-white/20 hover:bg-white/5"
                                }`}
                              >
                                <div className="border-b border-white/10 bg-gradient-to-br from-white/10 via-white/5 to-slate-950 px-5 py-5">
                                  <div className="flex items-start justify-between gap-4">
                                    <div>
                                      <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">{scenario.client}</div>
                                      <div className="mt-2 text-xl font-bold text-white">{scenario.name}</div>
                                    </div>
                                    <span
                                      className={`rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] ${complexityClasses(
                                        scenario.complexity
                                      )}`}
                                    >
                                      {scenario.complexity}
                                    </span>
                                  </div>
                                </div>

                                <div className="space-y-5 px-5 py-5">
                                  <div className="grid grid-cols-3 gap-3">
                                    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                                      <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Budget</div>
                                      <div className="mt-2 text-sm font-semibold text-white">{formatBudget(scenario.base_budget_cr)}</div>
                                    </div>
                                    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                                      <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Duration</div>
                                      <div className="mt-2 text-sm font-semibold text-white">
                                        {scenario.duration_rounds ? `${scenario.duration_rounds} Rounds` : "TBD"}
                                      </div>
                                    </div>
                                    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                                      <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Brief</div>
                                      <div className="mt-2 text-sm font-semibold text-white">{selected ? "Selected" : "Open"}</div>
                                    </div>
                                  </div>

                                  <div className="rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-4 text-sm leading-6 text-slate-300">
                                    {scenario.description ?? "Project brief coming soon."}
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}

                    {stepIndex === 2 ? (
                      <div className="space-y-6">
                        <div>
                          <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-500">Step 3</div>
                          <div className="mt-1 text-2xl font-black text-white">Competitive Positioning</div>
                        </div>

                        <div className="grid gap-5 xl:grid-cols-3">
                          {POSITIONING_OPTIONS.map((option) => {
                            const selected = positioningStrategy === option.value;
                            return (
                              <button
                                key={option.value}
                                type="button"
                                onClick={() => setPositioningStrategy(option.value)}
                                className={`rounded-3xl border bg-gradient-to-b p-5 text-left transition ${
                                  selected
                                    ? "border-amber-400/40 shadow-[0_22px_50px_rgba(251,191,36,0.12)]"
                                    : "border-white/10 hover:border-white/20"
                                } ${option.tone}`}
                              >
                                <div className="flex items-center justify-between gap-4">
                                  <span className="rounded-full border border-white/10 bg-slate-950/70 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-300">
                                    Play
                                  </span>
                                  <span
                                    className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] ${
                                      selected ? "bg-amber-500/15 text-amber-100" : "bg-white/5 text-slate-500"
                                    }`}
                                  >
                                    {selected ? "Selected" : "Open"}
                                  </span>
                                </div>
                                <div className="mt-8 text-xl font-bold text-white">{option.title}</div>
                                <div className="mt-3 text-sm leading-6 text-slate-200">{option.subtitle}</div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}

                    {stepIndex === 3 ? (
                      <div className="space-y-6">
                        <div>
                          <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-500">Step 4</div>
                          <div className="mt-1 text-2xl font-black text-white">KPI Target Selection</div>
                        </div>

                        <div className="rounded-3xl border border-white/10 bg-white/5 px-5 py-4">
                          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <div className="text-sm font-semibold text-white">Pick exactly 3 KPI targets. One primary KPI earns 4x points.</div>
                            <div className="rounded-full border border-white/10 bg-slate-950/70 px-3 py-2 text-xs font-bold uppercase tracking-[0.2em] text-slate-300">
                              {selectedKpis.length}/3 selected
                            </div>
                          </div>
                        </div>

                        <div className="grid gap-5 xl:grid-cols-2">
                          {KPI_OPTIONS.map(([title, description]) => {
                            const selected = selectedKpis.includes(title);
                            const primary = primaryKpi === title;
                            const limitReached = selectedKpis.length >= 3 && !selected;

                            return (
                              <div
                                key={title}
                                role="button"
                                tabIndex={0}
                                onClick={() => {
                                  if (limitReached) return;
                                  toggleKpi(title);
                                }}
                                onKeyDown={(event) => {
                                  if (event.key !== "Enter" && event.key !== " ") return;
                                  event.preventDefault();
                                  if (limitReached) return;
                                  toggleKpi(title);
                                }}
                                className={`rounded-3xl border p-5 text-left transition focus:outline-none focus:ring-2 focus:ring-amber-400/40 ${
                                  selected
                                    ? "border-amber-400/40 bg-white/10 shadow-[0_18px_45px_rgba(251,191,36,0.08)]"
                                    : "border-white/10 bg-slate-950/70 hover:border-white/20 hover:bg-white/5"
                                } ${limitReached ? "opacity-60" : ""}`}
                              >
                                <div className="flex items-start justify-between gap-4">
                                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-300">
                                    KPI
                                  </span>
                                  <span
                                    className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] ${
                                      selected ? "bg-amber-500/15 text-amber-100" : "bg-white/5 text-slate-500"
                                    }`}
                                  >
                                    {selected ? "Selected" : "Open"}
                                  </span>
                                </div>

                                <div className="mt-6 text-lg font-bold text-white">{title}</div>
                                <div className="mt-2 text-sm text-slate-300">{description}</div>

                                <div className="mt-5 flex flex-wrap items-center gap-3">
                                  {primary ? (
                                    <span className="rounded-full border border-amber-300/30 bg-amber-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-amber-100">
                                      Primary x4
                                    </span>
                                  ) : null}
                                  {selected ? (
                                    <button
                                      type="button"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        setPrimaryKpi(title);
                                      }}
                                      className={`rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] transition ${
                                        primary
                                          ? "border-amber-300/30 bg-amber-500/10 text-amber-100"
                                          : "border-white/10 bg-slate-950/70 text-slate-200 hover:border-white/20 hover:text-white"
                                      }`}
                                    >
                                      {primary ? "Primary KPI" : "Make Primary"}
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : null}

                    {saveError ? <Alert variant="error">{saveError}</Alert> : null}
                    {saveNotice ? <Alert variant="success">{saveNotice}</Alert> : null}

                    <div className="flex flex-col gap-4 border-t border-white/10 pt-6 sm:flex-row sm:items-center sm:justify-between">
                      <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">
                        {stepIndex === 3 ? "Final step" : `Up next | ${STEP_TITLES[stepIndex + 1]}`}
                      </div>

                      <div className="flex flex-col gap-3 sm:flex-row">
                        <Button
                          variant="ghost"
                          onClick={() => setStepIndex((current) => Math.max(0, current - 1) as StepIndex)}
                          disabled={stepIndex === 0 || saving}
                          className="h-11 rounded-2xl border border-white/10 bg-white/5 px-5 text-slate-200 hover:border-white/20"
                        >
                          Back
                        </Button>

                        <Button
                          onClick={handleContinue}
                          disabled={saving}
                          className="h-11 rounded-2xl border-amber-300/20 bg-gradient-to-r from-amber-400 to-orange-500 px-5 text-slate-950 shadow-[0_12px_28px_rgba(249,115,22,0.28)] hover:from-amber-300 hover:to-orange-400"
                        >
                          {saving ? "Saving..." : stepIndex === 3 ? "Complete Setup" : "Save & Continue"}
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardBody>
              </Card>
            </div>
          </div>
        </div>
      </Page>
    </RequireAuth>
  );
}
