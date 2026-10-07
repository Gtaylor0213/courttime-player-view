/**
 * LegalPage
 * Shared shell that renders a markdown legal document with consistent styling
 * and a back-to-home link. Public — does not require auth.
 *
 * Uses Vite's `?raw` import so the markdown source files in `/legal` stay the
 * single source of truth (the lawyer edits the .md files, this just renders).
 */

import { Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';

interface Props {
  title: string;
  source: string;
}

export function LegalPage({ title, source }: Props) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link to="/" className="text-lg font-bold text-emerald-700">
            CourtTime
          </Link>
          <Link to="/" className="text-sm text-gray-600 hover:text-emerald-700">
            ← Back to home
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="sr-only">{title}</h1>
        <article className="legal-prose text-gray-800">
          <ReactMarkdown
            components={{
              h1: ({ children }) => (
                <h1 className="mt-2 mb-6 text-3xl font-bold text-gray-900">{children}</h1>
              ),
              h2: ({ children }) => (
                <h2 className="mt-10 mb-4 text-xl font-semibold text-gray-900">{children}</h2>
              ),
              h3: ({ children }) => (
                <h3 className="mt-6 mb-3 text-lg font-semibold text-gray-900">{children}</h3>
              ),
              p: ({ children }) => <p className="mb-4 leading-7">{children}</p>,
              ul: ({ children }) => <ul className="mb-4 list-disc space-y-1 pl-6">{children}</ul>,
              ol: ({ children }) => <ol className="mb-4 list-decimal space-y-1 pl-6">{children}</ol>,
              li: ({ children }) => <li className="leading-7">{children}</li>,
              a: ({ href, children }) => (
                <a href={href} className="text-emerald-700 underline hover:text-emerald-900">
                  {children}
                </a>
              ),
              strong: ({ children }) => <strong className="font-semibold text-gray-900">{children}</strong>,
              hr: () => <hr className="my-8 border-gray-200" />,
              blockquote: ({ children }) => (
                <blockquote className="my-4 border-l-4 border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  {children}
                </blockquote>
              ),
              table: ({ children }) => (
                <div className="my-4 overflow-x-auto">
                  <table className="min-w-full border-collapse text-sm">{children}</table>
                </div>
              ),
              thead: ({ children }) => <thead className="bg-gray-100">{children}</thead>,
              th: ({ children }) => (
                <th className="border border-gray-200 px-3 py-2 text-left font-semibold">{children}</th>
              ),
              td: ({ children }) => (
                <td className="border border-gray-200 px-3 py-2 align-top">{children}</td>
              ),
            }}
          >
            {source}
          </ReactMarkdown>
        </article>

        <footer className="mt-12 border-t border-gray-200 pt-6 text-xs text-gray-500">
          <p>
            Questions? Email{' '}
            <a href="mailto:reidbissell@courttimeapp.com" className="text-emerald-700 underline">
              reidbissell@courttimeapp.com
            </a>
          </p>
        </footer>
      </main>
    </div>
  );
}
