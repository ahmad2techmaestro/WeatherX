import { Link } from "react-router-dom";
import { CloudOff } from "lucide-react";

import { EmptyState } from "../components/ui/States";

export default function NotFound() {
  return (
    <div className="page">
      <EmptyState icon={<CloudOff size={30} aria-hidden="true" />} title="This page has drifted off" message="We couldn't find the page you were looking for." action={<Link to="/" className="btn btn--primary">Back to today's weather</Link>} />
    </div>
  );
}
