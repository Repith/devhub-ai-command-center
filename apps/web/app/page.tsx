import { CommandCenter } from "@/components/command-center";
import { Suspense } from "react";

export default function Home(): React.JSX.Element {
  return (
    <Suspense fallback={null}>
      <CommandCenter />
    </Suspense>
  );
}
