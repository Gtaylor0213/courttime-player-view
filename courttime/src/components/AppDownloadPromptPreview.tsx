import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AppDownloadDialog } from './AppDownloadPrompt';

/**
 * Local-only preview of the "get the app" pop-up (the route exists only in
 * `npm run dev`). ?platform=android shows the Google Play version.
 */
export function AppDownloadPromptPreview() {
  const [params] = useSearchParams();
  const platform = params.get('platform') === 'android' ? 'android' : 'ios';
  const [open, setOpen] = useState(true);

  return (
    <div className="min-h-screen bg-gray-50 p-6 text-center text-sm text-gray-600">
      <p className="mt-24">Pop-up preview ({platform === 'ios' ? 'iPhone' : 'Android'}).</p>
      <button className="mt-4 rounded-md border bg-white px-4 py-2" onClick={() => setOpen(true)}>
        Show it again
      </button>
      <AppDownloadDialog platform={platform} open={open} onSnooze={() => setOpen(false)} onDismissForGood={() => setOpen(false)} />
    </div>
  );
}
