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

type SessionRow = {
  id: string;
  name: string | null;
  code: string;
  current_round: number;
  status: string;
  created_by: string;
};
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

type PositioningOption = {
  value: PositioningName;
  title: string;
  subtitle: string;
  tone: string;
  icon: string;
  tradeoff: string;
};

type KpiOption = {
  title: string;
  description: string;
  icon: string;
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

const STEP_SHORT_LABELS = ["Profile", "Project", "Strategy", "KPIs"] as const;

const POSITIONING_OPTIONS: PositioningOption[] = [
  {
    value: "Cost Leadership",
    title: "Cost Leadership",
    subtitle: "Win on price with disciplined commercial control and repeatable site execution.",
    tone: "from-sky-500/25 via-cyan-500/10 to-slate-950",
    icon: "\u{1F4B0}",
    tradeoff: "Higher volume, tighter margins",
  },
  {
    value: "Quality & Compliance",
    title: "Quality & Compliance",
    subtitle: "Win on assurance with defect-free delivery, traceability, and audit-ready systems.",
    tone: "from-emerald-500/25 via-teal-500/10 to-slate-950",
    icon: "\u{1F3C6}",
    tradeoff: "Lower volume, premium reputation",
  },
  {
    value: "Relationship & Escalation",
    title: "Relationship & Escalation",
    subtitle: "Win on trust with faster issue resolution, executive access, and calmer stakeholders.",
    tone: "from-amber-500/25 via-orange-500/10 to-slate-950",
    icon: "\u{1F91D}",
    tradeoff: "Client retention, referral driven",
  },
];

const KPI_OPTIONS: KpiOption[] = [
  { title: "Schedule Performance Index (SPI)", description: "Are you delivering on time?", icon: "\u23F1\uFE0F" },
  { title: "Cost Performance Index (CPI)", description: "Are you delivering within budget?", icon: "\u{1F4B0}" },
  { title: "Safety Score", description: "Incident-free execution", icon: "\u{1F9BA}" },
  { title: "Stakeholder Satisfaction", description: "Client and community relations", icon: "\u{1F91D}" },
  { title: "Quality Compliance Rate", description: "Snag-free handovers", icon: "\u2705" },
];

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
  return `\u20B9${numeric.toFixed(0)} Cr`;
}

function complexityClasses(complexity: ScenarioRow["complexity"]) {
  if (complexity === "extreme") return "border-rose-400/40 bg-rose-500/15 text-rose-100";
  if (complexity === "high") return "border-orange-400/40 bg-orange-500/15 text-orange-100";
  return "border-emerald-400/40 bg-emerald-500/15 text-emerald-100";
}

function getScenarioTypeMeta(name: string) {
  const lower = name.toLowerCase();
  if (lower.includes("metro")) return { icon: "\u{1F687}", label: "Metro" };
  if (lower.includes("airport")) return { icon: "\u2708\uFE0F", label: "Airport" };
  if (lower.includes("industrial")) return { icon: "\u{1F3ED}", label: "Industrial" };
  if (lower.includes("highway")) return { icon: "\u{1F6E3}\uFE0F", label: "Highway" };
  return { icon: "\u{1F3D7}\uFE0F", label: "Project" };
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

function isSessionCompleted(status: string | null | undefined) {
  const normalized = status?.toLowerCase();
  return normalized === "complete" || normalized === "completed";
}

function StepRail({ currentStep }: { currentStep: StepIndex }) {
  const connectorProgress = (currentStep / (STEP_SHORT_LABELS.length - 1)) * 75;

  return (
    <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/10 via-slate-950/80 to-slate-950 p-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-amber-300">Wizard Progress</div>
          <div className="mt-2 text-lg font-black text-white">Build your team identity in four moves</div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-3 text-right">
          <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-slate-500">Current Step</div>
          <div className="mt-1 text-lg font-black text-white">{currentStep + 1}/4</div>
        </div>
      </div>

      <div className="relative grid grid-cols-4 gap-3">
        <div className="pointer-events-none absolute left-[12.5%] right-[12.5%] top-6 h-[3px] -translate-y-1/2 rounded-full bg-white/10" />
        <div
          className="pointer-events-none absolute left-[12.5%] top-6 h-[3px] -translate-y-1/2 rounded-full bg-gradient-to-r from-emerald-400 via-amber-400 to-orange-400 transition-all duration-500"
          style={{ width: `${connectorProgress}%` }}
        />

        {STEP_SHORT_LABELS.map((label, index) => {
          const complete = index < currentStep;
          const active = index === currentStep;

          return (
            <div key={label} className="relative flex flex-col items-center text-center">
              <div
                className={`flex h-12 w-12 items-center justify-center rounded-full border-2 text-sm font-black transition ${
                  active
                    ? "border-amber-300 bg-amber-400 text-white shadow-[0_14px_30px_rgba(251,191,36,0.28)]"
                    : complete
                      ? "border-emerald-300 bg-emerald-400 text-white"
                      : "border-white/25 bg-slate-950 text-slate-300"
                }`}
              >
                {complete ? "\u2713" : index + 1}
              </div>
              <div className="mt-4 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Step {index + 1}</div>
              <div className={`mt-1 text-sm font-semibold ${active || complete ? "text-white" : "text-slate-400"}`}>{label}</div>
            </div>
          );
        })}
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
  const [showSuccessScreen, setShowSuccessScreen] = useState(false);
  const [resettingIdentity, setResettingIdentity] = useState(false);

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
  const [isSessionHost, setIsSessionHost] = useState(false);

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
        .select("id,name,code,current_round,status,created_by")
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

      const session = sessionData as SessionRow;
      const activeRoundNumber = Math.max(session.current_round ?? 0, 1);

      const [{ data: roundData, error: roundError }, { data: memberRows, error: memberError }, { data: scenarioRows, error: scenarioError }] =
        await Promise.all([
          supabase
            .from("session_rounds")
            .select("status")
            .eq("session_id", sessionId)
            .eq("round_number", activeRoundNumber)
            .maybeSingle(),
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
      setIsSessionHost(session.created_by === user.id);

      if (isSessionCompleted(session.status) || (team.identity_completed && session.created_by !== user.id)) {
        router.replace(`/sessions/${sessionId}`);
        return;
      }

      setLoading(false);
    })();
  }, [router, sessionId, supabase]);

  useEffect(() => {
    if (!showSuccessScreen) return;

    const redirectTimer = window.setTimeout(() => {
      router.push(`/sessions/${sessionId}`);
    }, 2000);

    return () => window.clearTimeout(redirectTimer);
  }, [router, sessionId, showSuccessScreen]);

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
    if (saved) setShowSuccessScreen(true);
  }

  async function handleResetIdentity() {
    if (!isSessionHost || !teamId) return;

    setResettingIdentity(true);
    setSaveError("");
    setSaveNotice("");

    const { error: resetError } = await supabase
      .from("teams")
      .update({ identity_completed: false, identity_profile: {} })
      .eq("id", teamId);

    if (resetError) {
      setSaveError(resetError.message);
      setResettingIdentity(false);
      return;
    }

    window.location.reload();
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

  const selectedScenario = scenarios.find((scenario) => scenario.id === selectedScenarioId) ?? null;
  const selectedScenarioType = selectedScenario ? getScenarioTypeMeta(selectedScenario.name) : null;
  const selectedPositioningOption = POSITIONING_OPTIONS.find((option) => option.value === positioningStrategy) ?? null;
  const selectedKpiOptions = KPI_OPTIONS.filter((option) => selectedKpis.includes(option.title));

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
                {!showSuccessScreen ? (
                  <Link
                    href={`/sessions/${sessionId}`}
                    className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold uppercase tracking-[0.22em] text-slate-300 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
                  >
                    Exit
                  </Link>
                ) : null}
              </div>
            </div>

            {error ? <Alert variant="error">{error}</Alert> : null}

            {!showSuccessScreen ? <StepRail currentStep={stepIndex} /> : null}

            {!showSuccessScreen ? (
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
                      <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">Project</div>
                      <div className="mt-2 text-sm font-medium text-slate-200">
                        {selectedScenario && selectedScenarioType
                          ? `${selectedScenarioType.icon} ${selectedScenario.name} | ${selectedScenario.client}`
                          : "Pending"}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                      <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">Strategy</div>
                      <div className="mt-2 text-sm font-medium text-slate-200">
                        {selectedPositioningOption ? `${selectedPositioningOption.icon} ${selectedPositioningOption.title}` : "Pending"}
                      </div>
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
                    {STEP_SHORT_LABELS.map((label, index) => (
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
                            const projectType = getScenarioTypeMeta(scenario.name);
                            return (
                              <button
                                key={scenario.id}
                                type="button"
                                onClick={() => setSelectedScenarioId(scenario.id)}
                                className={`relative overflow-hidden rounded-3xl border text-left transition ${
                                  selected
                                    ? "border-amber-300 bg-white/10 shadow-[0_24px_60px_rgba(251,191,36,0.16)]"
                                    : "border-white/10 bg-slate-950/70 hover:border-white/20 hover:bg-white/5"
                                }`}
                              >
                                {selected ? (
                                  <div className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full border border-amber-300/40 bg-amber-400 text-sm font-black text-white">
                                    {"\u2713"}
                                  </div>
                                ) : null}

                                <div className="border-b border-white/10 bg-gradient-to-br from-white/10 via-white/5 to-slate-950 px-5 py-5">
                                  <div className="flex items-start gap-4">
                                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-slate-950/80 text-2xl">
                                      {projectType.icon}
                                    </div>
                                    <div className="min-w-0 pr-10">
                                      <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">{projectType.label}</div>
                                      <div className="mt-2 text-2xl font-black text-white">{scenario.name}</div>
                                      <div className="mt-2 text-sm font-semibold text-slate-300">{scenario.client}</div>
                                    </div>
                                  </div>
                                </div>

                                <div className="space-y-5 px-5 py-5">
                                  <div className="flex flex-wrap gap-3">
                                    <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold text-slate-100">
                                      {formatBudget(scenario.base_budget_cr)}
                                    </span>
                                    <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-bold text-slate-100">
                                      {scenario.duration_rounds ? `${scenario.duration_rounds} rounds` : "TBD duration"}
                                    </span>
                                    <span
                                      className={`rounded-full border px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] ${complexityClasses(
                                        scenario.complexity
                                      )}`}
                                    >
                                      {scenario.complexity}
                                    </span>
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
                                className={`flex min-h-[320px] flex-col rounded-3xl border bg-gradient-to-b p-6 text-left transition ${
                                  selected
                                    ? "border-amber-300 shadow-[0_22px_50px_rgba(251,191,36,0.16)]"
                                    : "border-white/10 hover:border-white/20"
                                } ${option.tone}`}
                              >
                                <div className="flex items-start justify-between gap-4">
                                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-slate-950/75 text-3xl">
                                    {option.icon}
                                  </div>
                                  <span
                                    className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] ${
                                      selected ? "bg-amber-400 text-white" : "bg-white/5 text-slate-400"
                                    }`}
                                  >
                                    {selected ? "Selected" : "Open"}
                                  </span>
                                </div>

                                <div className="mt-8 text-2xl font-black text-white">{option.title}</div>
                                <div className="mt-3 text-sm leading-6 text-slate-200">{option.subtitle}</div>

                                <div className="mt-auto rounded-2xl border border-white/10 bg-slate-950/70 px-4 py-4">
                                  <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">Strategic Trade-off</div>
                                  <div className="mt-2 text-sm font-semibold text-slate-100">{option.tradeoff}</div>
                                </div>
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
                            <div className="text-sm font-semibold text-white">
                              Pick exactly 3 KPI targets. Then choose the one KPI that defines your win condition.
                            </div>
                            <div className="rounded-full border border-white/10 bg-slate-950/70 px-3 py-2 text-xs font-bold uppercase tracking-[0.2em] text-slate-300">
                              {selectedKpis.length}/3 selected
                            </div>
                          </div>
                        </div>

                        <div className="grid gap-5 xl:grid-cols-2">
                          {KPI_OPTIONS.map((option) => {
                            const selected = selectedKpis.includes(option.title);
                            const primary = primaryKpi === option.title;
                            const limitReached = selectedKpis.length >= 3 && !selected;

                            return (
                              <div
                                key={option.title}
                                role="button"
                                tabIndex={0}
                                onClick={() => {
                                  if (limitReached) return;
                                  toggleKpi(option.title);
                                }}
                                onKeyDown={(event) => {
                                  if (event.key !== "Enter" && event.key !== " ") return;
                                  event.preventDefault();
                                  if (limitReached) return;
                                  toggleKpi(option.title);
                                }}
                                className={`rounded-3xl border p-5 text-left transition focus:outline-none focus:ring-2 focus:ring-amber-400/40 ${
                                  primary
                                    ? "border-amber-300 bg-amber-500/10 shadow-[0_18px_45px_rgba(251,191,36,0.08)]"
                                    : selected
                                      ? "border-amber-400/40 bg-white/10 shadow-[0_18px_45px_rgba(251,191,36,0.08)]"
                                      : "border-white/10 bg-slate-950/70 hover:border-white/20 hover:bg-white/5"
                                } ${limitReached ? "opacity-60" : ""}`}
                              >
                                <div className="flex items-start justify-between gap-4">
                                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-2xl">
                                    {option.icon}
                                  </div>
                                  <span
                                    className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] ${
                                      primary
                                        ? "bg-amber-400 text-white"
                                        : selected
                                          ? "bg-amber-500/15 text-amber-100"
                                          : "bg-white/5 text-slate-500"
                                    }`}
                                  >
                                    {primary ? "Primary" : selected ? "Selected" : "Open"}
                                  </span>
                                </div>

                                <div className="mt-6 text-lg font-bold text-white">{option.title}</div>
                                <div className="mt-2 text-sm text-slate-300">{option.description}</div>
                              </div>
                            );
                          })}
                        </div>

                        {selectedKpiOptions.length === 3 ? (
                          <div className="rounded-3xl border border-amber-300/20 bg-gradient-to-br from-amber-500/10 via-slate-950/80 to-slate-950 p-5">
                            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                              <div>
                                <div className="text-[11px] font-bold uppercase tracking-[0.24em] text-amber-300">
                                  Choose your Primary KPI
                                </div>
                                <div className="mt-2 text-sm text-slate-200">
                                  Only one KPI gets the 4x scoring multiplier for your team.
                                </div>
                              </div>
                              <div className="rounded-full border border-white/10 bg-slate-950/80 px-3 py-2 text-xs font-bold uppercase tracking-[0.2em] text-slate-300">
                                3 finalists
                              </div>
                            </div>

                            <div className="mt-5 grid gap-4 lg:grid-cols-3">
                              {selectedKpiOptions.map((option) => {
                                const primary = primaryKpi === option.title;

                                return (
                                  <button
                                    key={option.title}
                                    type="button"
                                    onClick={() => setPrimaryKpi(option.title)}
                                    className={`rounded-3xl border p-5 text-left transition ${
                                      primary
                                        ? "border-yellow-300 bg-yellow-500/10 shadow-[0_18px_45px_rgba(250,204,21,0.12)]"
                                        : "border-white/10 bg-slate-950/70 hover:border-white/20 hover:bg-white/5"
                                    }`}
                                  >
                                    <div className="flex items-start justify-between gap-4">
                                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-2xl">
                                        {option.icon}
                                      </div>
                                      {primary ? (
                                        <span className="rounded-full border border-yellow-300/50 bg-yellow-400 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-slate-950">
                                          {"\u2B50"} Primary — 4x points
                                        </span>
                                      ) : null}
                                    </div>

                                    <div className="mt-5 text-base font-black text-white">{option.title}</div>
                                    <div className="mt-2 text-sm text-slate-300">{option.description}</div>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    {saveError ? <Alert variant="error">{saveError}</Alert> : null}
                    {saveNotice ? <Alert variant="success">{saveNotice}</Alert> : null}

                    <div className="space-y-4 border-t border-white/10 pt-6">
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">
                          {stepIndex === 3 ? "Final step" : `Up next | ${STEP_TITLES[stepIndex + 1]}`}
                        </div>

                        <div className="flex flex-col gap-3 sm:flex-row">
                          <Button
                            variant="ghost"
                            onClick={() => setStepIndex((current) => Math.max(0, current - 1) as StepIndex)}
                            disabled={stepIndex === 0 || saving || resettingIdentity}
                            className="h-11 rounded-2xl border border-white/10 bg-white/5 px-5 text-slate-200 hover:border-white/20"
                          >
                            Back
                          </Button>

                          <Button
                            onClick={handleContinue}
                            disabled={saving || resettingIdentity}
                            className="h-11 rounded-2xl border-amber-300/20 bg-gradient-to-r from-amber-400 to-orange-500 px-5 text-slate-950 shadow-[0_12px_28px_rgba(249,115,22,0.28)] hover:from-amber-300 hover:to-orange-400"
                          >
                            {saving ? "Saving..." : stepIndex === 3 ? "Complete Setup" : "Save & Continue"}
                          </Button>
                        </div>
                      </div>

                      {isSessionHost ? (
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={() => void handleResetIdentity()}
                            disabled={saving || resettingIdentity}
                            className="text-xs font-medium text-slate-500 underline decoration-slate-700 underline-offset-4 transition hover:text-amber-200 disabled:cursor-not-allowed disabled:no-underline disabled:opacity-60"
                          >
                            {resettingIdentity ? "Resetting company profile..." : "Reset company profile"}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </CardBody>
              </Card>
            </div>
            ) : (
              <Card className="border-amber-300/20 bg-gradient-to-br from-slate-950 via-slate-950 to-amber-950/30">
                <CardBody className="px-6 py-10">
                  <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
                    <div className="text-[11px] font-bold uppercase tracking-[0.3em] text-amber-300">Setup Complete</div>
                    <div className="mt-6 text-4xl font-black text-white sm:text-5xl">{companyName.trim() || teamName}</div>
                    <div className="mt-3 text-xl font-semibold text-slate-200">
                      Welcome to {selectedScenario?.name || "your project"}
                    </div>
                    <div className="relative mt-10 flex h-28 w-28 items-center justify-center">
                      <div className="absolute inset-0 rounded-full border-4 border-white/10 border-t-amber-300 animate-spin" />
                      <div className="flex h-20 w-20 items-center justify-center rounded-full border border-amber-300/30 bg-amber-500/10 text-3xl text-white">
                        {"\u2713"}
                      </div>
                    </div>
                    <div className="mt-8 max-w-xl text-sm leading-7 text-slate-300">
                      Your operating identity is locked in. We&apos;re opening the session command floor and loading the project context now.
                    </div>
                  </div>
                </CardBody>
              </Card>
            )}
          </div>
        </div>
      </Page>
    </RequireAuth>
  );
}
