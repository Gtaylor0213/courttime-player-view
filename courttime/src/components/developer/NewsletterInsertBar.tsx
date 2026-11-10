import { useState } from 'react';
import { Smartphone } from 'lucide-react';
import { cn } from '../ui/utils';
import {
  APP_BADGES_MARKUP,
  NEWSLETTER_LINK_GROUPS,
  newsletterLinkMarkup,
} from '../../../shared/utils/newsletterEmail';

interface Props {
  disabled: boolean;
  /**
   * Called with the markup to insert. `block` = it belongs on its own line
   * (a button or the badges); otherwise it goes inline at the cursor.
   * `text` is the link text, which a selection in the editor replaces.
   */
  onInsert: (markup: string, block: boolean, link?: { text: string; href: string }) => void;
}

/** One-click links for the newsletter editor: app stores, website pages, admin pages, help. */
export function NewsletterInsertBar({ disabled, onInsert }: Props) {
  const [asButton, setAsButton] = useState(false);

  return (
    <div className="rounded-md border border-gray-200 bg-gray-50 p-3 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-gray-700">Insert a link at the cursor</p>
        <div className="inline-flex rounded-md border border-gray-300 bg-white p-0.5 text-xs" role="radiogroup" aria-label="Insert as">
          {[false, true].map((button) => (
            <button key={String(button)} type="button" role="radio" aria-checked={asButton === button}
              disabled={disabled}
              onClick={() => setAsButton(button)}
              className={cn('rounded px-2.5 py-1', asButton === button ? 'bg-green-700 text-white' : 'text-gray-600 hover:bg-gray-100')}>
              {button ? 'Green button' : 'Text link'}
            </button>
          ))}
        </div>
      </div>

      <button type="button" disabled={disabled}
        onClick={() => onInsert(APP_BADGES_MARKUP, true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-green-700 bg-white px-2.5 py-1 text-xs font-medium text-green-800 hover:bg-green-50 disabled:opacity-50">
        <Smartphone className="h-3.5 w-3.5" />
        App Store + Google Play badges
      </button>

      {NEWSLETTER_LINK_GROUPS.map((group) => (
        <div key={group.title} className="space-y-1.5">
          <p className="text-[11px] uppercase tracking-wide text-gray-500">{group.title}</p>
          <div className="flex flex-wrap gap-1.5">
            {group.links.map((link) => (
              <button key={link.href} type="button" disabled={disabled} title={link.href}
                onClick={() => onInsert(newsletterLinkMarkup(link, asButton), asButton, link)}
                className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs text-gray-800 hover:bg-gray-100 disabled:opacity-50">
                {link.label}
              </button>
            ))}
          </div>
        </div>
      ))}
      <p className="text-[11px] text-gray-500">
        Tip: select some words in the email first and a text link will use them as the link text.
      </p>
    </div>
  );
}
