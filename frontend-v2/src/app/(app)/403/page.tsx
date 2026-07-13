import Link from "next/link";
import { ShieldOff } from "lucide-react";

export default function ForbiddenPage() {
  return (
    <div className="flex flex-col items-center justify-center h-[60vh] gap-4 text-center">
      <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-critical/10">
        <ShieldOff className="w-7 h-7 text-critical" />
      </div>
      <h1 className="text-2xl font-semibold text-primary">Access Denied</h1>
      <p className="text-muted max-w-sm">
        You don&apos;t have permission to access this page. Contact your administrator if you believe this is a mistake.
      </p>
      <Link href="/dashboard" className="text-brand underline underline-offset-2 text-sm">
        Return to Dashboard
      </Link>
    </div>
  );
}
