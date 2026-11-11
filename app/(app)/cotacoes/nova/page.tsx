import { Suspense } from "react";
import { Simulator } from "./Simulator";
import { Loading } from "@/components/ui";

export const metadata = { title: "Nova cotação" };

export default function NovaCotacaoPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Simulator />
    </Suspense>
  );
}
