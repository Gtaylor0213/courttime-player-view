import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { moderationApi } from '../api/client';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';

interface BlockedUser {
  userId: string;
  fullName: string;
  blockedAt: string;
}

/** Profile section listing the members this player has blocked, with unblock. */
export function BlockedMembersCard() {
  const [blocked, setBlocked] = useState<BlockedUser[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [unblockingId, setUnblockingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void moderationApi.listBlocked().then((response) => {
      if (cancelled) return;
      const data = response.data?.data ?? response.data;
      if (response.success) setBlocked(data?.blockedUsers ?? []);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const unblock = async (member: BlockedUser) => {
    setUnblockingId(member.userId);
    const response = await moderationApi.unblock(member.userId);
    setUnblockingId(null);
    if (!response.success) {
      toast.error(response.error || 'Could not unblock');
      return;
    }
    setBlocked((prev) => prev.filter((entry) => entry.userId !== member.userId));
    toast.success(`${member.fullName} is unblocked`);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Blocked Members</CardTitle>
        <CardDescription>
          You don't see messages or posts from members you block, and you can't message each other.
          To block someone, use the flag on their message or post.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!loaded ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : blocked.length === 0 ? (
          <p className="text-sm text-gray-500">You haven't blocked anyone.</p>
        ) : (
          <ul className="divide-y">
            {blocked.map((member) => (
              <li key={member.userId} className="flex items-center justify-between py-2">
                <span className="text-sm">{member.fullName}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => unblock(member)}
                  disabled={unblockingId !== null}
                >
                  {unblockingId === member.userId ? 'Unblocking…' : 'Unblock'}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
