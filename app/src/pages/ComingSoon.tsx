import { PageHeader, Card, EmptyState } from "@/ui/components";

export function ComingSoon({ title }: { title: string }) {
  return (
    <div className="page">
      <PageHeader title={title} subtitle="Planned for a future release" />
      <Card>
        <EmptyState
          icon="lock"
          title={`${title} is coming soon`}
          message="This area is part of the LegalOS roadmap. Module 1 (Request Intake & Management) is the active functional area."
        />
      </Card>
    </div>
  );
}
