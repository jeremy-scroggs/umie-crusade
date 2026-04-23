interface ResourcePillProps {
  label: string;
  value: number;
}

export function ResourcePill({ label, value }: ResourcePillProps) {
  return (
    <div className="flex items-center gap-1.5 bg-black/60 rounded-full px-3 py-1 text-sm font-mono text-white">
      <span className="text-yellow-400">{label}</span>
      <span>{value}</span>
    </div>
  );
}
