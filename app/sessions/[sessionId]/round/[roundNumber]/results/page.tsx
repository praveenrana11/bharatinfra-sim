import Link from "next/link";

type RoundResultsPageProps = {
  params: Promise<{
    sessionId: string;
    roundNumber: string;
  }>;
};

export default async function RoundResultsPage({
  params,
}: RoundResultsPageProps) {
  const { sessionId } = await params;

  return (
    <main className="mx-auto flex min-h-[50vh] max-w-3xl flex-col gap-4 px-6 py-10">
      <h1 className="text-3xl font-semibold text-slate-900">Round Results</h1>
      <p className="text-base text-slate-600">
        Results for this round will appear here.
      </p>
      <Link
        href={`/sessions/${sessionId}`}
        className="text-sm font-medium text-slate-900 underline underline-offset-4"
      >
        Back to session
      </Link>
    </main>
  );
}
