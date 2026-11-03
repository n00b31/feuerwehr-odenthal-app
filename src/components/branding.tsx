import Image from "next/image";
import { publicPath } from "@/config/app";

export function BrandLogo() {
  return <Image className="brand-logo" src={publicPath("/branding/feuerwehr-odenthal-logo.png")} alt="Feuerwehr Odenthal" width={300} height={100} unoptimized preload />;
}
export function BrandFlame({ size = 40 }: { size?: number }) {
  return <Image className="brand-flame" src={publicPath("/branding/feuerwehr-odenthal-flamme.png")} alt="" width={size} height={size} unoptimized />;
}
