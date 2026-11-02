import Link from "next/link";
export default function NotFound() {
  return <div className="empty"><h1>Hier ist kein Dienst geplant.</h1><p>Diese Seite gibt es nicht.</p><Link className="button primary" href="/">Zur Startseite</Link></div>;
}
