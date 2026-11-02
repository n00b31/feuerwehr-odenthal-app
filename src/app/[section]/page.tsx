import { notFound } from "next/navigation";
import { Events } from "@/components/events";
import { Documents } from "@/components/documents";
import { Statistics } from "@/components/statistics";
import { Profile } from "@/components/profile";
import { Administration } from "@/components/administration";

export const dynamicParams = false;

export function generateStaticParams() {
  return ["termine", "dokumente", "statistik", "profil", "administration"].map((section) => ({ section }));
}
export default async function Section({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  switch (section) {
    case "termine": return <Events />;
    case "dokumente": return <Documents />;
    case "statistik": return <Statistics />;
    case "profil": return <Profile />;
    case "administration": return <Administration />;
    default: notFound();
  }
}
