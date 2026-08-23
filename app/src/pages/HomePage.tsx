import { useApp } from "@/state/AppContext";
import { RequesterHome } from "./home/RequesterHome";
import { AssociateHome } from "./home/AssociateHome";
import { ParalegalHome } from "./home/ParalegalHome";
import { TeamHome } from "./home/TeamHome";
import { DirectorHome } from "./home/DirectorHome";

/** Role-based landing: each role gets its own operational workspace (PRD §3.7). */
export function HomePage() {
  const { currentUser } = useApp();
  switch (currentUser.role) {
    case "requester": return <RequesterHome />;
    case "paralegal": return <ParalegalHome />;
    case "adSeniorManager": return <TeamHome />;
    case "director": return <DirectorHome />;
    default: return <AssociateHome />; // seniorAssociate, managerAM → "My Queue"
  }
}
