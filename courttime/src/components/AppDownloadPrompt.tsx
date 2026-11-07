import { useEffect, useState } from 'react';
import { Smartphone } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { useAppContext } from '../contexts/AppContext';
import { notificationsApi } from '../api/client';
import { FEATURE_FLAGS } from '../../shared/constants/featureFlags';
import {
  APP_PROMPT_SNOOZE_MS,
  detectDevicePlatform,
  isAppPromptSuppressed,
  storeUrlFor,
  type AppPromptDismissal,
} from '../../shared/utils/appDownload';

const DISMISSED_KEY = 'appPrompt.dismissed';
const SNOOZED_UNTIL_KEY = 'appPrompt.snoozedUntil';

// Per-device memory of "Not now" / "I already have it". Storage can throw in
// private windows; then the prompt just reappears next visit.
function readDismissal(): AppPromptDismissal {
  try {
    const snoozed = Number(localStorage.getItem(SNOOZED_UNTIL_KEY));
    return {
      dismissed: localStorage.getItem(DISMISSED_KEY) === '1',
      snoozedUntil: Number.isFinite(snoozed) && snoozed > 0 ? snoozed : null,
    };
  } catch {
    return { dismissed: false, snoozedUntil: null };
  }
}

function writeStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

const COPY = {
  ios: {
    title: 'Get the CourtTime app',
    body: 'Book courts in a couple of taps and get a reminder before you play. Free on the App Store.',
    badge: { src: '/badges/app-store.png', alt: 'Download on the App Store', width: 144 },
  },
  android: {
    title: 'Get the CourtTime app',
    body: 'Book courts in a couple of taps and get a reminder before you play. Free on Google Play.',
    badge: { src: '/badges/google-play.png', alt: 'Get it on Google Play', width: 161 },
  },
} as const;

/**
 * Asks members using the website on a phone to download the app, with the
 * official store badge for their phone. Computers never see it. Behind the
 * app_download_prompt flag so each club can switch it on at launch.
 */
export function AppDownloadPrompt() {
  const { selectedFacilityId, enabledFeatures } = useAppContext();
  const [open, setOpen] = useState(false);
  const flagOn = !!selectedFacilityId && enabledFeatures.includes(FEATURE_FLAGS.APP_DOWNLOAD_PROMPT);
  const platform = detectDevicePlatform(navigator.userAgent, navigator.maxTouchPoints);
  const isPhone = platform !== 'desktop';
  const enabled = flagOn && isPhone;

  useEffect(() => {
    if (!enabled || isAppPromptSuppressed(readDismissal(), Date.now())) return;
    let cancelled = false;
    notificationsApi.getAppInstalled().then((result) => {
      // A failed check shows nothing: better to skip a nudge than nag an app user.
      if (!cancelled && result.success && result.data && !result.data.installed) setOpen(true);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  const snooze = () => {
    writeStorage(SNOOZED_UNTIL_KEY, String(Date.now() + APP_PROMPT_SNOOZE_MS));
    setOpen(false);
  };

  const dismissForGood = () => {
    writeStorage(DISMISSED_KEY, '1');
    setOpen(false);
  };

  if (platform === 'desktop') return null;
  return <AppDownloadDialog platform={platform} open={open} onSnooze={snooze} onDismissForGood={dismissForGood} />;
}

/** The pop-up itself; also rendered by the local-only preview page. */
export function AppDownloadDialog({
  platform,
  open,
  onSnooze,
  onDismissForGood,
}: {
  platform: 'ios' | 'android';
  open: boolean;
  onSnooze: () => void;
  onDismissForGood: () => void;
}) {
  const storeUrl = storeUrlFor(platform)!;
  const copy = COPY[platform];

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onSnooze()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-green-700" />
            {copy.title}
          </DialogTitle>
          <DialogDescription>{copy.body}</DialogDescription>
        </DialogHeader>

        <div className="flex justify-center py-1">
          {/* Following the link counts as "Not now": if they never finish installing, ask again later. */}
          <a href={storeUrl} target="_blank" rel="noopener noreferrer" onClick={onSnooze}>
            <img src={copy.badge.src} alt={copy.badge.alt} width={copy.badge.width} height={48} className="h-12 w-auto" />
          </a>
        </div>

        <div className="flex justify-between gap-2">
          <Button variant="ghost" onClick={onSnooze}>Not now</Button>
          <Button variant="ghost" onClick={onDismissForGood}>I already have it</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
