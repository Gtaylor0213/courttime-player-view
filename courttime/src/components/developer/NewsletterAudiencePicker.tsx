import { useEffect, useMemo, useState } from 'react';
import { Plus, Search, Users, X } from 'lucide-react';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Button } from '../ui/button';
import { Checkbox } from '../ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import {
  countNewsletterAudience,
  listNewsletterClubs,
  searchNewsletterPeople,
  type NewsletterAudience,
  type NewsletterTarget,
} from '../../api/supportClient';

type Kind = 'admins' | 'players' | 'clubs';

export const AUDIENCE_OPTIONS: { value: NewsletterAudience; label: string; people: string }[] = [
  { value: 'all_admins', label: 'All club admins', people: 'club admins' },
  { value: 'selected_admins', label: 'Selected club admins', people: 'club admins' },
  { value: 'all_players', label: 'All players', people: 'players' },
  { value: 'selected_players', label: 'Selected players', people: 'players' },
  { value: 'all_clubs', label: 'All clubs (every member and admin)', people: 'people' },
  { value: 'selected_clubs', label: 'Selected clubs (their members and admins)', people: 'people' },
];

export function audiencePeople(audience: NewsletterAudience): string {
  return AUDIENCE_OPTIONS.find((o) => o.value === audience)?.people ?? 'people';
}

function kindOf(audience: NewsletterAudience): Kind {
  return audience.endsWith('admins') ? 'admins' : audience.endsWith('players') ? 'players' : 'clubs';
}

const isSelected = (audience: NewsletterAudience) => audience.startsWith('selected_');

const HELP: Record<NewsletterAudience, string> = {
  all_admins: 'Everyone who is an active admin of a club.',
  selected_admins: 'Only the club admins you pick below.',
  all_players: 'Every account that isn’t a club admin, including people not in a club yet.',
  selected_players: 'Only the people you pick below.',
  all_clubs: 'Every active member and admin of every club.',
  selected_clubs: 'Every active member and admin of the clubs you pick below.',
};

interface Props {
  audience: NewsletterAudience;
  targetIds: string[];
  /** Names for already-picked ids (from the saved newsletter). */
  knownTargets: NewsletterTarget[];
  disabled: boolean;
  onChange: (audience: NewsletterAudience, targetIds: string[]) => void;
  /** Live number of addresses this audience reaches (null while counting or unknown). */
  onCount: (count: number | null) => void;
}

/**
 * "Send to" for a newsletter: all or picked club admins, players or clubs,
 * with a live count of who it would reach.
 */
export function NewsletterAudiencePicker({ audience, targetIds, knownTargets, disabled, onChange, onCount }: Props) {
  const kind = kindOf(audience);
  const [labels, setLabels] = useState<Record<string, NewsletterTarget>>({});
  const [count, setCount] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<NewsletterTarget[]>([]);
  const [searching, setSearching] = useState(false);
  const [clubs, setClubs] = useState<(NewsletterTarget & { people: number })[] | null>(null);
  const [clubFilter, setClubFilter] = useState('');

  useEffect(() => {
    if (knownTargets.length === 0) return;
    setLabels((prev) => ({ ...prev, ...Object.fromEntries(knownTargets.map((t) => [t.id, t])) }));
  }, [knownTargets]);

  // Live count, debounced so typing/picking doesn't hammer the server.
  const key = `${audience}|${targetIds.join(',')}`;
  useEffect(() => {
    let cancelled = false;
    setCount(null);
    onCount(null);
    if (isSelected(audience) && targetIds.length === 0) {
      setCount(0);
      onCount(0);
      return;
    }
    const timer = setTimeout(async () => {
      const res = await countNewsletterAudience(audience, targetIds);
      if (cancelled || !res.success) return;
      setCount(res.data.count);
      onCount(res.data.count);
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (kind !== 'clubs' || clubs) return;
    listNewsletterClubs().then((res) => {
      if (res.success) setClubs(res.data);
    });
  }, [kind, clubs]);

  useEffect(() => {
    setSearch('');
    setResults([]);
  }, [kind]);

  useEffect(() => {
    if (kind === 'clubs' || !isSelected(audience) || search.trim().length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      const res = await searchNewsletterPeople(kind, search.trim());
      if (cancelled) return;
      setSearching(false);
      if (res.success) setResults(res.data);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search, kind, audience]);

  const changeAudience = (next: NewsletterAudience) => {
    // Picked ids only carry over between "selected" options of the same kind (they never do today).
    onChange(next, isSelected(next) && kindOf(next) === kind ? targetIds : []);
  };

  const add = (target: NewsletterTarget) => {
    setLabels((prev) => ({ ...prev, [target.id]: target }));
    if (!targetIds.includes(target.id)) onChange(audience, [...targetIds, target.id]);
  };
  const remove = (id: string) => onChange(audience, targetIds.filter((t) => t !== id));
  const toggleClub = (club: NewsletterTarget, on: boolean) => (on ? add(club) : remove(club.id));

  const visibleClubs = useMemo(() => {
    const f = clubFilter.trim().toLowerCase();
    return (clubs ?? []).filter((c) => !f || c.label.toLowerCase().includes(f) || (c.detail ?? '').toLowerCase().includes(f));
  }, [clubs, clubFilter]);

  const people = audiencePeople(audience);

  return (
    <div className="space-y-2">
      <Label>Send to</Label>
      <Select value={audience} disabled={disabled} onValueChange={(v) => changeAudience(v as NewsletterAudience)}>
        <SelectTrigger className="w-full sm:w-96">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {AUDIENCE_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-gray-500 flex items-center gap-1.5">
        <Users className="h-3.5 w-3.5" />
        {HELP[audience]}{' '}
        <span className="font-medium text-gray-700">
          {count === null ? 'Counting…' : `Reaches ${count} ${count === 1 ? people.replace(/s$/, '') : people} right now.`}
        </span>
      </p>

      {isSelected(audience) && targetIds.length > 0 && kind !== 'clubs' && (
        <div className="flex flex-wrap gap-1.5">
          {targetIds.map((id) => (
            <span key={id} className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-800">
              {labels[id]?.label ?? 'Loading…'}
              {!disabled && (
                <button type="button" aria-label="Remove" onClick={() => remove(id)} className="text-gray-500 hover:text-gray-900">
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          ))}
          {!disabled && targetIds.length > 1 && (
            <button type="button" className="text-xs text-gray-500 underline" onClick={() => onChange(audience, [])}>
              Clear all
            </button>
          )}
        </div>
      )}

      {isSelected(audience) && kind !== 'clubs' && !disabled && (
        <div className="rounded-md border border-gray-200">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
            <Input className="pl-8 border-0 shadow-none focus-visible:ring-0" value={search}
              placeholder={kind === 'admins' ? 'Search club admins by name or email' : 'Search players by name or email'}
              onChange={(e) => setSearch(e.target.value)} />
          </div>
          {search.trim().length >= 2 && (
            <div className="max-h-56 overflow-y-auto border-t border-gray-100">
              {searching && results.length === 0 && <p className="px-3 py-2 text-xs text-gray-500">Searching…</p>}
              {!searching && results.length === 0 && <p className="px-3 py-2 text-xs text-gray-500">No matches.</p>}
              {results.map((r) => {
                const picked = targetIds.includes(r.id);
                return (
                  <div key={r.id} className="flex items-center justify-between gap-2 px-3 py-1.5 hover:bg-gray-50">
                    <div className="min-w-0">
                      <p className="text-sm text-gray-900 truncate">{r.label}</p>
                      {r.detail && <p className="text-xs text-gray-500 truncate">{r.detail}</p>}
                    </div>
                    <Button size="sm" variant={picked ? 'secondary' : 'outline'} disabled={picked} onClick={() => add(r)}>
                      {picked ? 'Added' : <><Plus className="h-3.5 w-3.5 mr-1" />Add</>}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {audience === 'selected_clubs' && (
        <div className="rounded-md border border-gray-200">
          <div className="flex items-center justify-between gap-2 border-b border-gray-100 px-2">
            <div className="relative flex-1">
              <Search className="absolute left-0.5 top-2.5 h-4 w-4 text-gray-400" />
              <Input className="pl-6 border-0 shadow-none focus-visible:ring-0" value={clubFilter}
                placeholder="Filter clubs" onChange={(e) => setClubFilter(e.target.value)} />
            </div>
            <span className="text-xs text-gray-500 whitespace-nowrap">{targetIds.length} selected</span>
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {clubs === null && <p className="px-3 py-2 text-xs text-gray-500">Loading clubs…</p>}
            {visibleClubs.map((club) => (
              <label key={club.id} className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-gray-50 cursor-pointer">
                <Checkbox checked={targetIds.includes(club.id)} disabled={disabled}
                  onCheckedChange={(v) => toggleClub(club, v === true)} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-gray-900 truncate">{club.label}</span>
                  {club.detail && <span className="block text-xs text-gray-500 truncate">{club.detail}</span>}
                </span>
                <span className="text-xs text-gray-500 whitespace-nowrap">{club.people} people</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
