export function Logo({ dark = false }: { dark?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span aria-hidden className="grid h-9 w-9 -skew-x-6 place-items-center rounded-lg bg-lime-brand text-lg font-black italic text-pine-950">
        F
      </span>
      <span className={`text-xl font-extrabold tracking-tight ${dark ? "text-pine-950" : "text-white"}`}>Fretebase</span>
    </span>
  );
}
