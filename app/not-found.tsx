import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#080C16] text-slate-100 p-4 text-center">
      <h2 className="text-2xl font-bold mb-2">Page Not Found</h2>
      <p className="text-sm text-slate-400 mb-4">
        The requested avatar or scene could not be found.
      </p>
      <Link
        href="/"
        className="px-4 py-2 rounded-full bg-sky-500 text-slate-950 font-semibold text-xs transition-colors hover:bg-sky-400"
      >
        Return to Studio
      </Link>
    </div>
  );
}
