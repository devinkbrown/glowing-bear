'use client';

export default function ReadMarker() {
  return (
    <div className="flex items-center gap-2 px-4 py-1.5 select-none">
      <div className="flex-1 h-px bg-red-500/30" />
      <span className="text-[10px] font-semibold uppercase tracking-wider text-red-500/50">new</span>
      <div className="flex-1 h-px bg-red-500/30" />
    </div>
  );
}
